import { Redirect } from 'expo-router';
import { Loader } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function Index() {
  const { me, loading } = useAuth();
  if (loading) return <Loader />;
  return <Redirect href={me ? '/(tabs)' : '/login'} />;
}
