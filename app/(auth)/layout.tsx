export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-density="site" className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-[380px] rounded-lg border border-edge bg-surface p-5">{children}</div>
    </div>
  );
}
