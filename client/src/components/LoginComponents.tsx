export const Card: React.FC<React.ComponentProps<'div'>> = ({ className = '', ...p }) => (
  <div className={`rounded-lg border bg-white shadow-sm ${className}`} {...p} />
);

export const CardContent: React.FC<React.ComponentProps<'div'>> = ({ className = '', ...p }) => (
  <div className={`p-6 ${className}`} {...p} />
);

export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={
      'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ' +
      'shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none ' +
      'focus:ring-1 focus:ring-blue-500 ' +
      (props.className ?? '')
    }
  />
);

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = '',
  children,
  ...p
}) => (
  <button
    className={
      'inline-flex h-10 w-full items-center justify-center rounded-md bg-blue-600 ' +
      'px-4 py-2 text-sm font-medium text-white shadow transition-colors ' +
      'hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 ' +
      className
    }
    {...p}
  >
    {children}
  </button>
);
