import styles from './TaskInputArea.module.css'

/**
 * TaskInputArea — static visual skeleton.
 * No business logic yet; placeholder copy only.
 * Logic will be wired in the "Add & Display Tasks" ticket.
 */
function TaskInputArea() {
  return (
    <section className={styles.section} aria-label="Add a new task">
      <h2 className={styles.heading}>Add a task</h2>
      <div className={styles.inputRow}>
        <input
          className={styles.input}
          type="text"
          placeholder="What needs to be done?"
          aria-label="New task description"
          disabled
        />
        <button className={styles.submitButton} type="button" disabled>
          Add
        </button>
      </div>
    </section>
  )
}

export default TaskInputArea
