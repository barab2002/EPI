import { render, screen } from '@testing-library/react';
import { Login, loginErrorMessage, ssoLoginHref } from './Login';

describe('Login', () => {
  it('shows the SSO button when OIDC is enabled', () => {
    render(<Login demo={false} oidc onSignedIn={() => undefined} />);
    const link = screen.getByRole('link', { name: 'Sign in with your organization account' });
    expect(link).toHaveAttribute('href', '/api/v1/auth/login?return_to=%2F');
  });

  it('explains when no sign-in method exists', () => {
    render(<Login demo={false} oidc={false} onSignedIn={() => undefined} />);
    expect(screen.getByText(/No sign-in method is configured/)).toBeInTheDocument();
  });

  it('maps callback error codes to helpful messages', () => {
    expect(loginErrorMessage('?login_error=not_provisioned')).toMatch(/do not have an EPI account/);
    expect(loginErrorMessage('?login_error=something_else')).toMatch(/not completed/);
    expect(loginErrorMessage('')).toBeNull();
  });

  it('encodes the return path', () => {
    expect(ssoLoginHref('/teams/a b')).toBe('/api/v1/auth/login?return_to=%2Fteams%2Fa%20b');
  });
});
