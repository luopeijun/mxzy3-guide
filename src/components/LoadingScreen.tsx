import EmptyState from './EmptyState';

interface Props {
  title: string;
  text: string;
}

export default function LoadingScreen({ title, text }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-[520px]">
        <EmptyState title={title} text={text} />
      </div>
    </div>
  );
}
