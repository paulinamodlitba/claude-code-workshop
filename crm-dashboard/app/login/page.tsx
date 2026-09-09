export default function LoginPage({
  searchParams,
}: {
  searchParams: { from?: string; error?: string }
}) {
  return (
    <main style={{ maxWidth: 320, margin: '80px auto' }}>
      <h1>Logga in</h1>
      {searchParams.error && <p style={{ color: 'crimson' }}>Fel lösenord.</p>}
      <form method="POST" action="/api/login">
        <input type="hidden" name="from" value={searchParams.from ?? '/'} />
        <input type="password" name="password" placeholder="Lösenord" autoFocus />
        <button type="submit">Logga in</button>
      </form>
    </main>
  )
}
