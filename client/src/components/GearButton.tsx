import { Settings } from 'lucide-react';          // tiny SVG gear icon
import { useNavigate } from 'react-router-dom';
import { HTMLAttributes } from 'react';

type Props = HTMLAttributes<HTMLButtonElement> & {
  size?: number;          // icon px size (default 20)
  to?: string;            // path to navigate (default "/settings")
};

export default function GearButton({
  size = 20,
  to = '/settings',
  className = '',
  ...rest
}: Props) {
  const nav = useNavigate();
  return (
    <button
      type="button"
      onClick={() => nav(to)}
      title="Settings"
      className={`inline-flex items-center justify-center rounded-full
                  p-2 hover:bg-gray-200 dark:hover:bg-gray-700
                  transition-colors ${className}`}
      {...rest}
    >
      <Settings width={size} height={size} strokeWidth={1.8} />
    </button>
  );
}
