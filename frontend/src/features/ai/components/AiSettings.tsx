import { useState } from 'react';
import type { FormEvent } from 'react';
import { Badge, Button, ErrorState, Input, Select } from '../../../components/ui';
import { getAiErrorMessage } from '../api/gemini.api';
import { useAiSettings } from '../hooks/useAiSettings';

const API_KEY_URL = 'https://aistudio.google.com/apikey';

export const AiSettings = () => {
  const { isConnected, model, availableModels, connect, refresh, setModel, disconnect } =
    useAiSettings();
  const [key, setKey] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!key.trim()) return;

    connect.mutate(key, {
      // The plaintext leaves component state as soon as it is encrypted.
      onSuccess: () => setKey(''),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Get feedback on your notes from Google Gemini. Your key stays in this browser, encrypted,
        and is sent only to Google.{' '}
        <a
          href={API_KEY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink underline underline-offset-2"
        >
          Create a free key
        </a>
        .
      </p>

      <div>
        <Badge variant={isConnected ? 'success' : 'neutral'}>
          {isConnected ? 'Connected' : 'Not connected'}
        </Badge>
      </div>

      {connect.isError && (
        <ErrorState title="Could not connect" message={getAiErrorMessage(connect.error)} />
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
        <Input
          label={isConnected ? 'Replace API key' : 'Gemini API key'}
          name="gemini_api_key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="AIza…"
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={connect.isPending} disabled={!key.trim()}>
            Test &amp; save
          </Button>
        </div>
      </form>

      <Select
        label="Model"
        value={model ?? ''}
        disabled={!isConnected}
        onChange={(event) => setModel(event.target.value)}
        hint={isConnected ? undefined : 'Connect a key to choose a model.'}
        error={
          isConnected && refresh.isError
            ? `Could not refresh the model list: ${getAiErrorMessage(refresh.error)}`
            : undefined
        }
      >
        {availableModels.map((option) => (
          <option key={option.name} value={option.name}>
            {option.displayName}
          </option>
        ))}
      </Select>

      {isConnected && (
        <div>
          <Button variant="danger" size="sm" onClick={disconnect}>
            Remove key
          </Button>
        </div>
      )}
    </div>
  );
};
