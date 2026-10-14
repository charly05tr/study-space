import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Divider,
  ErrorState,
  Skeleton,
  SkeletonText,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useAuthStore } from '../../auth/store/authStore';
import { IS_DESKTOP } from '../../../config/desktop';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { ProfileForm } from '../components/ProfileForm';
import { useProfile } from '../hooks/useProfile';

export const ProfilePage = () => {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const profile = useProfile();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  if (profile.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-measure flex-col gap-6">
        <Skeleton className="size-20 rounded-full" />
        <SkeletonText lines={4} />
      </div>
    );
  }

  if (profile.isError) {
    return (
      <div className="mx-auto w-full max-w-measure">
        <ErrorState
          title="Could not load your profile"
          message={getApiErrorMessage(profile.error)}
          onRetry={() => profile.refetch()}
        />
      </div>
    );
  }

  const user = profile.data;
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');

  return (
    <article className="mx-auto flex w-full max-w-measure flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-5">
          <ProfileAvatar user={user} />

          <div className="flex min-w-0 flex-col gap-1">
            {/* An account with no name still needs a heading, and the email is
                already printed underneath — a second copy in display type
                would read as a name that happens to be an address. */}
            <h1 className="truncate font-display text-4xl text-ink">
              {fullName || 'Your account'}
            </h1>
            <p className="truncate text-sm text-muted">{user.email}</p>
          </div>
        </div>

        <div>
          <Badge variant={user.is_verified ? 'success' : 'neutral'}>
            {user.is_verified ? 'Verified' : 'Not verified'}
          </Badge>
        </div>

        <Divider ornament className="max-w-40" />
      </header>

      {/* Keyed on the account so the fields re-seed if it is ever refetched
          into a different user — signing out and back in without a reload. */}
      <ProfileForm key={user.id} user={user} />

      {!IS_DESKTOP && (
        <>
          <Divider />

          <section className="flex flex-col gap-3">
            <h2 className="font-heading text-sm uppercase tracking-[0.18em] text-ink">Session</h2>
            <div>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                Log out
              </Button>
            </div>
          </section>
        </>
      )}
    </article>
  );
};
