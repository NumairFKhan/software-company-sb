import styles from './TaskListArea.module.css'

/**
 * TaskListArea — static visual skeleton.
 * Renders placeholder task rows to establish the visual structure.
 * Real data wiring happens in the "Add & Display Tasks" ticket.
 */
function TaskListArea() {
  return (
    <section className={styles.section} aria-label="Task list">
      <h2 className={styles.heading}>Your tasks</h2>
      <ul className={styles.list} role="list">
        {/* Placeholder rows — will be replaced with dynamic content */}
        <li className={styles.taskRow}>
          <span className={styles.taskText}>Example task — buy groceries</span>
          <div className={styles.taskActions}>
            <button
              className={styles.actionButton}
              type="button"
              aria-label="Mark complete"
              disabled
            >
              ✓
            </button>
            <button
              className={`${styles.actionButton} ${styles.deleteButton}`}
              type="button"
              aria-label="Delete task"
              disabled
            >
              ✕
            </button>
          </div>
        </li>
        <li className={styles.taskRow}>
          <span className={styles.taskText}>Example task — call the dentist</span>
          <div className={styles.taskActions}>
            <button
              className={styles.actionButton}
              type="button"
              aria-label="Mark complete"
              disabled
            >
              ✓
            </button>
            <button
              className={`${styles.actionButton} ${styles.deleteButton}`}
              type="button"
              aria-label="Delete task"
              disabled
            >
              ✕
            </button>
          </div>
        </li>
        <li className={`${styles.taskRow} ${styles.completed}`}>
          <span className={styles.taskText}>Example task — read the docs</span>
          <div className={styles.taskActions}>
            <button
              className={styles.actionButton}
              type="button"
              aria-label="Mark complete"
              disabled
            >
              ✓
            </button>
            <button
              className={`${styles.actionButton} ${styles.deleteButton}`}
              type="button"
              aria-label="Delete task"
              disabled
            >
              ✕
            </button>
          </div>
        </li>
      </ul>
    </section>
  )
}

export default TaskListArea
