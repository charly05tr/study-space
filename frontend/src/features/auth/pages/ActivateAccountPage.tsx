import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  useNotification,
} from '../../../components/ui';
import { useActivateMutation, useResendCodeMutation } from '../hooks/useAuthMutations';
import { getApiErrorMessage, getFieldErrors } from '../../../lib/apiError';

/** VerificationCode.create_for_user generates 6 digits, valid for 15 minutes. */
const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

export const ActivateAccountPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useNotification();

  const activate = useActivateMutation();
  const resend = useResendCodeMutation();

  // RegisterPage forwards the address; on a cold visit the user retypes it.
  const forwardedEmail = (location.state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = useState(forwardedEmail);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const fieldErrors = getFieldErrors(activate.error);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    activate.mutate(
      { email: email.trim(), code },
      { onSuccess: () => navigate('/studyspaces', { replace: true }) },
    );
  };

  const handleResend = () => {
    resend.mutate(email.trim(), {
      onSuccess: (data) => {
        setCooldown(RESEND_COOLDOWN_SECONDS);
        notify({ variant: 'success', title: 'Code sent', message: data.message });
      },
      onError: (error) =>
        notify({ variant: 'error', title: 'Could not resend', message: getApiErrorMessage(error) }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your inbox</CardTitle>
        <CardDescription>
          Enter the {CODE_LENGTH}-digit code we sent you. It expires 15 minutes after it is issued.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit} noValidate>
        <CardBody className="flex flex-col gap-4">
          {activate.isError && (
            <ErrorState title="Activation failed" message={getApiErrorMessage(activate.error)} />
          )}

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
            label="Verification code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={CODE_LENGTH}
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            error={fieldErrors.code}
            /* No font-* class here: it would collide with fieldClasses' font-body. */
            className="text-center text-2xl tracking-[0.5em]"
          />

          <Button
            type="submit"
            loading={activate.isPending}
            disabled={code.length !== CODE_LENGTH}
            className="mt-1"
          >
            Activate account
          </Button>
        </CardBody>
      </form>

      <CardFooter className="flex-col items-stretch gap-3 text-center text-sm text-muted">
        <Button
          variant="quiet"
          size="sm"
          onClick={handleResend}
          loading={resend.isPending}
          disabled={!email.trim() || cooldown > 0}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </Button>
        <p>
          Wrong address?{' '}
          <Link to="/register" className="text-primary-ink underline underline-offset-4">
            Register again
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
};
