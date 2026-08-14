// UsernameSetup — the required popup shown right after a wallet connects.
//
// The user must pick a display name before using the app; it is mapped to
// their public wallet address on the analytics server and cached locally so it
// is only asked once per wallet. The dialog cannot be dismissed until a valid
// username is saved.

import { useEffect, useRef, useState } from 'react';
import { registerUsername, USERNAME_MAX_LENGTH, USERNAME_PATTERN } from '../../lib/analytics';
import { NETWORK } from '../../lib/env';
import { setStoredUsername } from '../../store/username';
import { IconUser } from '../icons';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export function UsernameSetupModal({
  address,
  onSaved,
}: {
  address: string;
  onSaved: (username: string) => void;
}) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trimmed = username.trim();
  const tooLong = trimmed.length > USERNAME_MAX_LENGTH;
  const invalidChars = !USERNAME_PATTERN.test(trimmed);
  const canSubmit = trimmed.length > 0 && !tooLong && !invalidChars && !saving;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const accepted = await registerUsername(address, trimmed, NETWORK);
      setStoredUsername(address, accepted);
      onSaved(accepted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your username. Please try again.');
      setSaving(false);
      inputRef.current?.focus();
    }
  };

  return (
    <Modal open title="Choose your username" dismissable={false}>
      <div className="username-setup">
        <div className="username-setup__intro">
          <IconUser size={20} />
          <p>
            One last step: pick the display name your wallet will be known by.
            It is stored against your public wallet address and cannot be empty.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span className="label">Username</span>
            <input
              ref={inputRef}
              type="text"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setError(null);
              }}
              placeholder="e.g. alice_2010"
              maxLength={USERNAME_MAX_LENGTH + 16}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error !== null || tooLong || invalidChars}
              aria-describedby="username-hint"
              disabled={saving}
            />
            <span className="hint" id="username-hint">
              Letters, numbers, spaces, dots, underscores and hyphens · max {USERNAME_MAX_LENGTH} chars
            </span>
          </label>

          {(error || tooLong || invalidChars) && (
            <p className="error" role="alert">
              {error ??
                (tooLong
                  ? `Username must be at most ${USERNAME_MAX_LENGTH} characters.`
                  : 'Username may only contain letters, numbers, spaces, dots, underscores and hyphens.')}
            </p>
          )}

          <div className="username-setup__foot">
            <span className="mono username-setup__addr" title={address}>
              {address.slice(0, 12)}…{address.slice(-8)}
            </span>
            <Button variant="primary" type="submit" loading={saving} disabled={!canSubmit} block>
              {saving ? 'Saving…' : 'Save username'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
