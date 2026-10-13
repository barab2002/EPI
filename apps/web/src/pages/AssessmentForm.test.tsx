import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setCsrfToken } from '../api';
import { AssessmentForm } from './AssessmentForm';

describe('AssessmentForm', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps actions enabled and explains every missing field, focusing the first', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(<AssessmentForm subjectUserId="u1" onSaved={() => undefined} />);
    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Choose an independence rating.')).toBeInTheDocument();
    expect(screen.getByText('Choose a growth rating.')).toBeInTheDocument();
    expect(screen.getByText(/at least 20 characters/)).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText('1: Substantially dependent'));
    await userEvent.click(screen.getByLabelText('3: Meets grade expectations'));
    await userEvent.click(screen.getByLabelText('4: Ahead of plan'));
    await userEvent.type(screen.getByRole('textbox'), 'too short');
    await userEvent.click(submit);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Choose an independence rating.')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
  });

  it('starts from my saved draft', () => {
    render(
      <AssessmentForm
        subjectUserId="u1"
        onSaved={() => undefined}
        initial={{ independence: 2, growth: 4, evidence: 'Draft evidence from earlier this week.' }}
      />,
    );
    expect(screen.getByLabelText('2: Needs frequent guidance')).toBeChecked();
    expect(screen.getByLabelText('4: Ahead of plan')).toBeChecked();
    expect(screen.getByRole('textbox')).toHaveValue('Draft evidence from earlier this week.');
  });

  it('submits with the CSRF header and reports success', async () => {
    setCsrfToken('csrf-123');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'a1', status: 'submitted' }), { status: 201 }),
      );
    const onSaved = vi.fn();
    render(<AssessmentForm subjectUserId="u1" onSaved={onSaved} />);
    await userEvent.click(screen.getByLabelText('3: Meets grade expectations'));
    await userEvent.click(screen.getByLabelText('3: Progressing as agreed'));
    await userEvent.type(
      screen.getByRole('textbox'),
      'Led the incident review and fixed root cause.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Submitted.')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/reviews');
    expect((init?.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-123');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      subjectUserId: 'u1',
      independence: 3,
      growth: 3,
      submit: true,
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it('shows server errors accessibly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Assessment already submitted for this cycle' }), {
        status: 409,
      }),
    );
    render(<AssessmentForm subjectUserId="u1" onSaved={() => undefined} />);
    await userEvent.click(screen.getByLabelText('3: Meets grade expectations'));
    await userEvent.click(screen.getByLabelText('3: Progressing as agreed'));
    await userEvent.type(screen.getByRole('textbox'), 'Evidence that is long enough to pass.');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already submitted');
  });
});
