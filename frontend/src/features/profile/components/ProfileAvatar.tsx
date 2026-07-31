import type { User } from '../../auth/types';
import { initialsOf } from '../initials';

interface ProfileAvatarProps {
  user: User;
}

export const ProfileAvatar = ({ user }: ProfileAvatarProps) => {
  const source = user.profile_img?.url ?? user.avatar_url;

  if (source) {
    return (
      <img
        src={source}
        // Empty, not "Profile photo": the name is already written beside it, and
        // a screen reader announcing both says the same thing twice.
        alt=""
        className="size-20 shrink-0 rounded-full border border-rule object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="grid size-20 shrink-0 place-items-center rounded-full border border-primary-200 bg-primary-50 font-heading text-2xl tracking-[0.06em] text-primary-ink"
    >
      {initialsOf(user)}
    </span>
  );
};
