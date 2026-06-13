type Slot = "header-banner" | "in-article" | "sidebar" | "footer-banner";

const slotHeights: Record<Slot, string> = {
  "header-banner": "min-h-[90px]",
  "in-article": "min-h-[180px]",
  sidebar: "min-h-[250px]",
  "footer-banner": "min-h-[120px]",
};

export default function AdSlot({ slot }: { slot: Slot }) {
  return (
    <div
      data-ad-slot={slot}
      className={`rounded-[1.75rem] border border-dashed border-amber-200 bg-amber-50/60 p-5 text-center text-sm text-gray-500 ${slotHeights[slot]}`}
    >
      {/* Replace content with your Google AdSense ad unit script */}
      <div className="flex h-full items-center justify-center">Advertisement slot: {slot}</div>
    </div>
  );
}