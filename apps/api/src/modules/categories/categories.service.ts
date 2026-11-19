import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VerificationType } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';

export interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  remoteAllowed: boolean;
  requiredVerifications: VerificationType[];
  children: CategoryNode[];
}

const withTranslations = { translations: true, countries: true } satisfies Prisma.ServiceCategoryInclude;
type CatRow = Prisma.ServiceCategoryGetPayload<{ include: typeof withTranslations }>;

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  pickName(cat: { slug: string; translations: { locale: string; name: string; description: string | null }[] }, locale: string) {
    const t = cat.translations.find((x) => x.locale === locale) ?? cat.translations.find((x) => x.locale === 'en') ?? cat.translations[0];
    return { name: t?.name ?? cat.slug, description: t?.description ?? null };
  }

  requiredFor(cat: CatRow, countryCode: string): VerificationType[] {
    const cc = cat.countries.find((c) => c.countryCode === countryCode);
    return cc?.overrideRequirements ? cc.requiredVerifications : cat.requiredVerifications;
  }

  isAvailableIn(cat: CatRow, countryCode: string) {
    return cat.isActive && cat.countries.some((c) => c.countryCode === countryCode && c.isActive);
  }

  /** Public, localized category tree for a country. */
  async tree(countryCode: string, locale: string): Promise<CategoryNode[]> {
    const all = await this.prisma.serviceCategory.findMany({ include: withTranslations, orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }] });
    const visible = all.filter((c) => this.isAvailableIn(c, countryCode));
    const ids = new Set(visible.map((c) => c.id));
    const toNode = (c: CatRow): CategoryNode => ({
      id: c.id, slug: c.slug, icon: c.icon, remoteAllowed: c.remoteAllowed,
      ...this.pickName(c, locale),
      requiredVerifications: this.requiredFor(c, countryCode),
      children: visible.filter((x) => x.parentId === c.id).map(toNode),
    });
    return visible.filter((c) => !c.parentId || !ids.has(c.parentId)).map(toNode);
  }

  async getForCountry(id: string, countryCode: string) {
    const cat = await this.prisma.serviceCategory.findUnique({ where: { id }, include: withTranslations });
    if (!cat || !this.isAvailableIn(cat, countryCode)) throw new BadRequestException('This service category is not available in your country');
    return { cat, required: this.requiredFor(cat, countryCode) };
  }

  /** IDs of a category and all its descendants (used by search). */
  async descendantIds(id: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE t AS (
        SELECT id FROM "ServiceCategory" WHERE id = ${id}
        UNION ALL SELECT c.id FROM "ServiceCategory" c JOIN t ON c."parentId" = t.id
      ) SELECT id FROM t`;
    return rows.map((r) => r.id);
  }

  // ───────── Admin ─────────

  adminList() {
    return this.prisma.serviceCategory.findMany({ include: withTranslations, orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }] });
  }

  async upsert(actorId: string, id: string | null, dto: AdminCategoryInput) {
    if (dto.parentId && dto.parentId === id) throw new BadRequestException('A category cannot be its own parent');
    if (id && dto.parentId) {
      const desc = await this.descendantIds(id);
      if (desc.includes(dto.parentId)) throw new BadRequestException('Cannot move a category under its own descendant');
    }
    const data = {
      slug: dto.slug, parentId: dto.parentId ?? null, icon: dto.icon, sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true, remoteAllowed: dto.remoteAllowed ?? false,
      requiredVerifications: dto.requiredVerifications ?? [],
    };
    const cat = await this.prisma.$transaction(async (tx) => {
      const c = id
        ? await tx.serviceCategory.update({ where: { id }, data })
        : await tx.serviceCategory.create({ data });
      for (const t of dto.translations ?? []) {
        await tx.categoryTranslation.upsert({
          where: { categoryId_locale: { categoryId: c.id, locale: t.locale } },
          create: { categoryId: c.id, locale: t.locale, name: t.name, description: t.description },
          update: { name: t.name, description: t.description },
        });
      }
      for (const cc of dto.countries ?? []) {
        await tx.categoryCountry.upsert({
          where: { categoryId_countryCode: { categoryId: c.id, countryCode: cc.countryCode } },
          create: { categoryId: c.id, countryCode: cc.countryCode, isActive: cc.isActive, overrideRequirements: cc.overrideRequirements ?? false, requiredVerifications: cc.requiredVerifications ?? [] },
          update: { isActive: cc.isActive, overrideRequirements: cc.overrideRequirements ?? false, requiredVerifications: cc.requiredVerifications ?? [] },
        });
      }
      await this.audit.log({ actorId, action: id ? 'admin.category.update' : 'admin.category.create', entityType: 'ServiceCategory', entityId: c.id, metadata: dto as object }, tx);
      return c;
    });
    return this.prisma.serviceCategory.findUnique({ where: { id: cat.id }, include: withTranslations });
  }

  async setActive(actorId: string, id: string, isActive: boolean) {
    const exists = await this.prisma.serviceCategory.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException();
    await this.prisma.serviceCategory.update({ where: { id }, data: { isActive } });
    await this.audit.log({ actorId, action: isActive ? 'admin.category.activate' : 'admin.category.deactivate', entityType: 'ServiceCategory', entityId: id });
    return { ok: true };
  }
}

export interface AdminCategoryInput {
  slug: string;
  parentId?: string | null;
  icon?: string;
  sortOrder?: number;
  isActive?: boolean;
  remoteAllowed?: boolean;
  requiredVerifications?: VerificationType[];
  translations?: { locale: string; name: string; description?: string }[];
  countries?: { countryCode: string; isActive: boolean; overrideRequirements?: boolean; requiredVerifications?: VerificationType[] }[];
}
