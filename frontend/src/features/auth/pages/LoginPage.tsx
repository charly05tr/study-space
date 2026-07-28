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
import { useLoginMutation } from '../hooks/useAuthMutations';
import { getApiErrorMessage, getFieldErrors } from '../../../lib/apiError';

export const LoginPage = () => {
  const navigate = useNavigate();
  const login = useLoginMutation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const fieldErrors = getFieldErrors(login.error);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login.mutate(
      { email: email.trim(), password },
      { onSuccess: () => navigate('/studyspaces', { replace: true }) },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Pick up where you left off.</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit} noValidate>
        <CardBody className="flex flex-col gap-4">
          {login.isError && <ErrorState title="Sign in failed" message={getApiErrorMessage(login.error)} />}

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
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
          />

          <Button type="submit" loading={login.isPending} className="mt-1">
            Sign in
          </Button>
        </CardBody>
      </form>

      <CardFooter className="flex-col items-stretch gap-2 text-center text-sm text-muted">
        <p>
          No account yet?{' '}
          <Link to="/register" className="text-primary-ink underline underline-offset-4">
            Create one
          </Link>
        </p>
        <p>
          Waiting on a code?{' '}
          <Link to="/activate" className="text-primary-ink underline underline-offset-4">
            Activate your account
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
};
