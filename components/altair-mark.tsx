type AltairMarkProps = {
  className?: string;
};

export const AltairMark = ({ className }: AltairMarkProps) => {
  return (
    <svg viewBox="96 96 320 320" fill="none" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M408 408C291 300 221 300 104 408C212 291 212 221 104 104C221 212 291 212 408 104C300 221 300 291 408 408Z"
      />
    </svg>
  );
};
