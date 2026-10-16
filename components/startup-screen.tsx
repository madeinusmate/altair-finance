import { AltairMark } from "@/components/altair-mark";

export const StartupScreen = () => {
  return (
    <div className="flex min-h-screen items-center justify-center text-foreground">
      <AltairMark className="altair-mark-spin size-[88px]" />
    </div>
  );
};
