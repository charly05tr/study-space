/**
 * Desktop mode is a build-time flag (`vite build --mode desktop`, see
 * `.env.desktop`). The app runs as a single local user served by the same
 * Django process, so there is no login, no token and no refresh.
 */
export const IS_DESKTOP = import.meta.env.VITE_DESKTOP === 'true';

/**
 * Stand-in for the signed-in user until the profile is fetched. The backend
 * ignores the id in `/users/<id>/` and always answers with the request user.
 */
export const DESKTOP_PLACEHOLDER_USER = {
  id: 1,
  email: 'local@studyspace.local',
  first_name: '',
  last_name: '',
  profile_img: null,
  phone: null,
  is_verified: true,
  is_active: true,
  avatar_url: null,
} as const;
