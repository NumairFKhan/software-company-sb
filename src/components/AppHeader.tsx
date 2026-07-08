import styles from './AppHeader.module.css'

function AppHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.logo} aria-hidden="true">
          <svg
            width="28"
            height="28"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="100" height="100" rx="20" fill="#4f46e5" />
            <rect x="20" y="30" width="60" height="10" rx="5" fill="white" />
            <rect x="20" y="46" width="60" height="10" rx="5" fill="white" />
            <rect x="20" y="62" width="40" height="10" rx="5" fill="white" />
          </svg>
        </div>
        <div>
          <h1 className={styles.title}>QuickList</h1>
          <p className={styles.subtitle}>Simple. Fast. Local.</p>
        </div>
      </div>
    </header>
  )
}

export default AppHeader
