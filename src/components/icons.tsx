/** Tiny stroke icons shared by the side rail and the back-to-top button.
 *  All of them inherit `currentColor` and size through `className`. */

interface IconProps {
  className?: string;
}

function Chevron({ points, className }: IconProps & { points: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={points} />
    </svg>
  );
}

export function IconChevronUp({ className }: IconProps) {
  return <Chevron className={className} points="M2.5 7.5 6 4l3.5 3.5" />;
}

export function IconChevronLeft({ className }: IconProps) {
  return <Chevron className={className} points="M7.5 2.5 4 6l3.5 3.5" />;
}

export function IconChevronRight({ className }: IconProps) {
  return <Chevron className={className} points="M4.5 2.5 8 6l-3.5 3.5" />;
}
