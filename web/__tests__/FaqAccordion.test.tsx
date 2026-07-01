import { render, screen, fireEvent, waitForElementToBeRemoved } from '@testing-library/react';
import { FaqAccordion } from '@/components/FaqAccordion';

const items = [
  { question: 'Question One?', answer: 'Answer to question one.' },
  { question: 'Question Two?', answer: 'Answer to question two.' },
  { question: 'Question Three?', answer: 'Answer to question three.' },
];

describe('FaqAccordion', () => {
  it('renders all questions, with all answers collapsed initially', () => {
    render(<FaqAccordion items={items} />);

    items.forEach((item) => {
      expect(screen.getByText(item.question)).toBeInTheDocument();
    });

    // Answers should not be in the document while collapsed (AnimatePresence unmounts them)
    items.forEach((item) => {
      expect(screen.queryByText(item.answer)).not.toBeInTheDocument();
    });

    // All buttons should report aria-expanded=false
    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('expands an answer when its question is clicked', () => {
    render(<FaqAccordion items={items} />);

    const firstButton = screen.getByText(items[0].question).closest('button');
    expect(firstButton).not.toBeNull();

    fireEvent.click(firstButton as HTMLElement);

    expect(screen.getByText(items[0].answer)).toBeInTheDocument();
    expect(firstButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses an already-open answer when clicked again (toggle behavior)', async () => {
    render(<FaqAccordion items={items} />);

    const firstButton = screen.getByText(items[0].question).closest('button') as HTMLElement;

    fireEvent.click(firstButton);
    expect(screen.getByText(items[0].answer)).toBeInTheDocument();
    expect(firstButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(firstButton);
    // aria-expanded flips synchronously with state; DOM removal may lag behind
    // the exit animation (AnimatePresence), so we assert on the accessible
    // state immediately and wait for the animated element to actually unmount.
    expect(firstButton).toHaveAttribute('aria-expanded', 'false');
    await waitForElementToBeRemoved(() => screen.queryByText(items[0].answer));
  });

  it('allows independent toggling of multiple items at once (not exclusive accordion)', () => {
    render(<FaqAccordion items={items} />);

    const firstButton = screen.getByText(items[0].question).closest('button') as HTMLElement;
    const secondButton = screen.getByText(items[1].question).closest('button') as HTMLElement;

    fireEvent.click(firstButton);
    fireEvent.click(secondButton);

    // Both should be open simultaneously per spec (no force-close of other items)
    expect(screen.getByText(items[0].answer)).toBeInTheDocument();
    expect(screen.getByText(items[1].answer)).toBeInTheDocument();
  });

  it('renders nothing crashing with an empty items array', () => {
    render(<FaqAccordion items={[]} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
