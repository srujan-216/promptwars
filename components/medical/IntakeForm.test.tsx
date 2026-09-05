import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import { IntakeForm } from './IntakeForm';
import { EMPTY_INTAKE, type Intake } from '@/lib/intake/schema';

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
};

function setup(value: Intake = EMPTY_INTAKE, errors: Record<string, string> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <IntakeForm value={value} onChange={onChange} errors={errors} onRegisterFieldId={vi.fn()} />,
  );
  return { onChange, ...utils };
}

describe('IntakeForm — labelling', () => {
  it.each([
    'Name or identifier',
    'Age',
    'Sex',
    'Existing conditions',
    'Current medications',
    'Allergies',
    'Additional notes',
    'No known allergies',
  ])('labels %s', (label) => {
    setup();

    expect(screen.getByLabelText(label)).toBeInTheDocument();
  });

  it('groups the fields under a named fieldset', () => {
    setup();

    expect(screen.getByRole('group', { name: 'About the patient' })).toBeInTheDocument();
  });
});

describe('IntakeForm — editing', () => {
  it('reports a typed identifier', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.type(screen.getByLabelText('Name or identifier'), 'A');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'A' }));
  });

  it('reports age as a number, not a string', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.type(screen.getByLabelText('Age'), '4');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ age: 4 }));
  });

  it('reports a cleared age as null rather than zero', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ ...EMPTY_INTAKE, age: 34 });

    await user.clear(screen.getByLabelText('Age'));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ age: null }));
  });

  it('renders an existing list one entry per line', () => {
    setup({ ...EMPTY_INTAKE, medications: ['Metformin', 'Aspirin'] });

    expect(screen.getByLabelText('Current medications')).toHaveValue('Metformin\nAspirin');
  });

  it('reports a typed medication as a list entry', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.type(screen.getByLabelText('Current medications'), 'M');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ medications: ['M'] }));
  });

  it('adds a symptom row', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole('button', { name: 'Add symptom' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ symptoms: [{ name: '', duration: '' }] }),
    );
  });

  it('removes a symptom row', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({
      ...EMPTY_INTAKE,
      symptoms: [{ name: 'Headache', duration: '' }],
    });

    await user.click(screen.getByRole('button', { name: /Remove symptom 1/ }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ symptoms: [] }));
  });

  it('gives each symptom row a distinct accessible name', () => {
    setup({
      ...EMPTY_INTAKE,
      symptoms: [
        { name: 'Headache', duration: '' },
        { name: 'Fatigue', duration: '' },
      ],
    });

    expect(screen.getByLabelText('Symptom 1 name')).toBeInTheDocument();
    expect(screen.getByLabelText('Symptom 2 name')).toBeInTheDocument();
  });
});

describe('IntakeForm — accessible errors', () => {
  it('marks an invalid field with aria-invalid', () => {
    setup(EMPTY_INTAKE, { age: 'Age must be 130 or less.' });

    expect(screen.getByLabelText('Age')).toHaveAttribute('aria-invalid', 'true');
  });

  it('describes the field with its error message', () => {
    setup(EMPTY_INTAKE, { age: 'Age must be 130 or less.' });

    expect(screen.getByLabelText('Age')).toHaveAccessibleDescription('Age must be 130 or less.');
  });

  it('announces the error via role=alert', () => {
    setup(EMPTY_INTAKE, { age: 'Age must be 130 or less.' });

    expect(screen.getByRole('alert')).toHaveTextContent('Age must be 130 or less.');
  });

  it('leaves valid fields unmarked', () => {
    setup(EMPTY_INTAKE, { age: 'Age must be 130 or less.' });

    expect(screen.getByLabelText('Name or identifier')).toHaveAttribute('aria-invalid', 'false');
  });
});

describe('IntakeForm — accessibility', () => {
  it('has no axe violations when empty', async () => {
    const { container } = setup();

    expect((await axe.run(container, AXE_OPTIONS)).violations).toEqual([]);
  });

  it('has no axe violations with symptom rows and errors', async () => {
    const { container } = setup(
      { ...EMPTY_INTAKE, symptoms: [{ name: 'Headache', duration: '' }] },
      { age: 'Age must be 130 or less.', allergies: 'Please resolve one.' },
    );

    expect((await axe.run(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
