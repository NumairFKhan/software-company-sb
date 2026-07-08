import AppHeader from './components/AppHeader'
import TaskInputArea from './components/TaskInputArea'
import TaskListArea from './components/TaskListArea'
import styles from './App.module.css'

function App() {
  return (
    <div className={styles.app}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.container}>
          <TaskInputArea />
          <TaskListArea />
        </div>
      </main>
    </div>
  )
}

export default App
