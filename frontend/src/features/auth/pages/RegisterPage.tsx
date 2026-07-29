import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
  ErrorState,
  Input,
} from '../../../components/ui';
import { useRegisterMutation } from '../hooks/useAuthMutations';
import { getApiErrorMessage, getFieldErrors } from '../../../lib/apiError';
import type { RegisterPayload } from '../types';


export const RegisterPage = () => {
  const navigate = useNavigate();
  const register = useRegisterMutation();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const fieldErrors = getFieldErrors(register.error);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();


    const payload: RegisterPayload = {
      email: email.trim(),
      password,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
    };

    register.mutate(payload, {
      onSuccess: () => navigate('/activate', { state: { email: payload.email } }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>We will email you a six-digit code to confirm it.</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit} noValidate>
        <CardBody className="flex flex-col gap-4">
          {register.isError && (
            <ErrorState title="Registration failed" message={getApiErrorMessage(register.error)} />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="First name"
              name="first_name"
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              error={fieldErrors.first_name}
            />
            <Input
              label="Last name"
              name="last_name"
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              error={fieldErrors.last_name}
            />
          </div>

          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
          />
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
          />

          <Button type="submit" loading={register.isPending} className="mt-1">
            Create account
          </Button>
        </CardBody>
      </form>

      <CardFooter className="justify-center text-sm text-muted">
        <p>
          Already registered?{' '}
          <Link to="/login" className="text-primary-ink underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
};
