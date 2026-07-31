import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, ErrorState, Input, useNotification } from '../../../components/ui';
import { getApiErrorMessage, getFieldErrors } from '../../../lib/apiError';
import type { User } from '../../auth/types';
import { useUpdateProfile } from '../hooks/useProfile';

interface ProfileFormProps {
  user: User;
}

/**
 * Its own component so the fields can be seeded from `useState`'s initialiser.
 *
 * Kept inside the page, this was an effect copying the fetched account into
 * three pieces of state on every change — a second render for nothing, and a
 * refetch landing mid-edit would have overwritten what was being typed. The
 * page only renders this once the account has arrived, so the initial value IS
 * the loaded one and there is nothing left to synchronise.
 */
export const ProfileForm = ({ user }: ProfileFormProps) => {
  const { notify } = useNotification();
  const updateProfile = useUpdateProfile();

  const [firstName, setFirstName] = useState(user.first_name ?? '');
  const [lastName, setLastName] = useState(user.last_name ?? '');

  const fieldErrors = getFieldErrors(updateProfile.error);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    updateProfile.mutate(
      { first_name: firstName.trim(), last_name: lastName.trim() },
      {
        onSuccess: () =>
          notify({
            variant: 'success',
            title: 'Profile saved',
            message: 'Your details are up to date.',
          }),
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <h2 className="font-heading text-sm uppercase tracking-[0.18em] text-ink">Details</h2>

      {updateProfile.isError && (
        <ErrorState
          title="Could not save your profile"
          message={getApiErrorMessage(updateProfile.error)}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="First name"
          name="first_name"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          error={fieldErrors.first_name}
        />
        <Input
          label="Last name"
          name="last_name"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          error={fieldErrors.last_name}
        />
      </div>

      {/* The email is the login identity and this API has no path to change
          it — shown, never offered as a field. */}
      <Input label="Email" name="email" value={user.email} readOnly disabled />

      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={updateProfile.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
};
