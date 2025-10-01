export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-4">
          <div className="font-semibold">Settings</div>
        </div>
      </header>
      <section className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Impostazioni</h1>
        <p className="text-sm text-gray-600">Placeholder — qui aggiungeremo le preferenze utente.</p>
      </section>
    </main>
  );
}
