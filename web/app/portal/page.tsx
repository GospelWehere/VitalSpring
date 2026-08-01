import BookingWizard from "./BookingWizard";

export const metadata = { title: "Book an Appointment — Patient Portal" };

export default function PortalPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-6 text-center text-sm text-ink-soft">
        Self-service booking shares the same schedule used by reception, telephone and walk-in
        bookings — every channel sees one true list of open times.
      </p>
      <BookingWizard />
    </div>
  );
}
