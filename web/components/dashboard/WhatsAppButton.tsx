// BusBuzz support number — kept in one place rather than inlined at the
// call site so it only needs updating here if it ever changes.
const SUPPORT_WHATSAPP_NUMBER = '2349063815324';

export function WhatsAppButton() {
  return (
    <a
      href={`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with BusBuzz support on WhatsApp"
      title="Chat with BusBuzz support on WhatsApp"
      className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-[0_10px_30px_-6px_rgba(0,0,0,0.4)] transition-transform duration-150 hover:scale-105 active:scale-95 lg:bottom-6 lg:right-6"
    >
      <svg viewBox="0 0 24 24" width="30" height="30" fill="#FFFFFF" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
        <path d="M12.004 2.003c-5.514 0-9.997 4.483-9.997 9.997 0 1.762.462 3.484 1.34 5.001L2 22l5.116-1.341a9.958 9.958 0 0 0 4.888 1.28h.004c5.513 0 9.996-4.483 9.996-9.997 0-2.67-1.04-5.18-2.929-7.069a9.933 9.933 0 0 0-7.07-2.87zm0 18.164a8.15 8.15 0 0 1-4.153-1.137l-.298-.177-3.037.796.81-2.96-.194-.304a8.145 8.145 0 0 1-1.255-4.352c0-4.507 3.667-8.174 8.176-8.174 2.183 0 4.236.85 5.78 2.395a8.12 8.12 0 0 1 2.394 5.784c0 4.508-3.667 8.129-8.223 8.129z" />
      </svg>
    </a>
  );
}
