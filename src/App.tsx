import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import type { Project, Task } from './types/types'
import { getProjectTasks, getProjects } from './api'

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [tasksError, setTasksError] = useState<string | null>(null)
  const [isProjectsLoading, setIsProjectsLoading] = useState(false)
  const [isTasksLoading, setIsTasksLoading] = useState(false)
  const [allTasksByProject, setAllTasksByProject] = useState<Record<number, Task[]>>({})
  const [isAllLoading, setIsAllLoading] = useState(false)
  const [allError, setAllError] = useState<string | null>(null)
  const allRequestId = useRef(0)

  useEffect(() => {
    let isActive = true
    setIsProjectsLoading(true)
    setProjectsError(null)

    getProjects()
      .then((data) => {
        if (!isActive) return
        setProjects(data)
        setSelectedProjectId((current) => current ?? data[0]?.id ?? null)
      })
      .catch((error: Error) => {
        if (!isActive) return
        setProjectsError(error.message)
      })
      .finally(() => {
        if (!isActive) return
        setIsProjectsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    if (selectedProjectId === null) {
      setTasks([])
      return
    }

    let isActive = true
    setIsTasksLoading(true)
    setTasksError(null)

    getProjectTasks(selectedProjectId)
      .then((data) => {
        if (!isActive) return
        setTasks(data)
      })
      .catch((error: Error) => {
        if (!isActive) return
        setTasksError(error.message)
      })
      .finally(() => {
        if (!isActive) return
        setIsTasksLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [selectedProjectId])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

  const allProjectGroups = useMemo(() => {
    if (Object.keys(allTasksByProject).length === 0) return []
    return projects.map((project) => ({
      project,
      tasks: allTasksByProject[project.id] ?? [],
    }))
  }, [allTasksByProject, projects])

  const handleLoadAllProjects = async () => {
    const requestId = ++allRequestId.current
    setIsAllLoading(true)
    setAllError(null)

    try {
      const nextProjects = await getProjects()
      const taskEntries = await Promise.all(
        nextProjects.map(async (project) => [project.id, await getProjectTasks(project.id)] as const)
      )

      if (allRequestId.current !== requestId) return

      setProjects(nextProjects)
      setSelectedProjectId((current) => current ?? nextProjects[0]?.id ?? null)
      setAllTasksByProject(Object.fromEntries(taskEntries))
    } catch (error) {
      if (allRequestId.current !== requestId) return
      setAllError(error instanceof Error ? error.message : 'Failed to load projects')
    } finally {
      if (allRequestId.current === requestId) {
        setIsAllLoading(false)
      }
    }
  }

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <p className="app__eyebrow">Project Insights</p>
          <h1 className="app__title">Task Management Viewer</h1>
        </div>
        <div className="app__meta">
          <span>API: {import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4500'}</span>
        </div>
        <div className="app__actions">
          <button
            type="button"
            className="primary-button"
            onClick={handleLoadAllProjects}
            disabled={isAllLoading}
          >
            {isAllLoading ? 'Loading all projects...' : 'Load all projects & tasks'}
          </button>
        </div>
      </header>

      <main className="app__layout">
        <section className="panel">
          <div className="panel__header">
            <h2>Projects</h2>
            <span className="panel__count">{projects.length}</span>
          </div>

          {isProjectsLoading && <p className="panel__muted">Loading projects…</p>}
          {projectsError && <p className="panel__error">{projectsError}</p>}

          <div className="panel__list">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`project-card${project.id === selectedProjectId ? ' is-active' : ''}`}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <div>
                  <h3>{project.name}</h3>
                  <p className="panel__muted">{project.taskCount} tasks</p>
                </div>
                <div className="project-card__dates">
                  <span>Start: {formatDate(project.earliestStartDate)}</span>
                  <span>End: {formatDate(project.latestEndDate)}</span>
                  <span>Duration: {project.durationDays ?? '—'} days</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel panel--wide">
          <div className="panel__header">
            <h2>Tasks</h2>
            <span className="panel__count">{tasks.length}</span>
          </div>

          {!selectedProject && !isProjectsLoading && (
            <p className="panel__muted">Select a project to view tasks.</p>
          )}

          {selectedProject && (
            <div className="panel__summary">
              <h3>{selectedProject.name}</h3>
              <p className="panel__muted">
                {selectedProject.taskCount} tasks • Start {formatDate(selectedProject.earliestStartDate)} • End{' '}
                {formatDate(selectedProject.latestEndDate)}
              </p>
            </div>
          )}

          {isTasksLoading && <p className="panel__muted">Loading tasks…</p>}
          {tasksError && <p className="panel__error">{tasksError}</p>}

          <div className="task-list">
            {tasks.map((task) => (
              <div key={task.id} className="task-row">
                <div>
                  <h4>{task.name}</h4>
                  <p className="panel__muted">
                    Start {formatDate(task.startDate)} • Due {formatDate(task.dueDate)}
                  </p>
                </div>
                <div className={`status-pill status-pill--${task.status.replace(' ', '-')}`}>
                  {task.status}
                </div>
              </div>
            ))}
          </div>

          <div className="panel__section">
            <div className="panel__section-header">
              <h3>All projects and tasks</h3>
              {isAllLoading && <span className="panel__muted">Loading...</span>}
            </div>

            {allError && <p className="panel__error">{allError}</p>}

            {!isAllLoading && !allError && allProjectGroups.length === 0 && (
              <p className="panel__muted">Use the button above to load every project and its tasks.</p>
            )}

            {allProjectGroups.map(({ project, tasks: groupedTasks }) => (
              <div key={project.id} className="project-group">
                <div className="project-group__header">
                  <div>
                    <h4>{project.name}</h4>
                    <p className="panel__muted">{groupedTasks.length} tasks</p>
                  </div>
                  <div className="project-group__dates">
                    <span>Start: {formatDate(project.earliestStartDate)}</span>
                    <span>End: {formatDate(project.latestEndDate)}</span>
                  </div>
                </div>

                <div className="task-list">
                  {groupedTasks.map((task) => (
                    <div key={task.id} className="task-row">
                      <div>
                        <h4>{task.name}</h4>
                        <p className="panel__muted">
                          Start {formatDate(task.startDate)} • Due {formatDate(task.dueDate)}
                        </p>
                      </div>
                      <div className={`status-pill status-pill--${task.status.replace(' ', '-')}`}>
                        {task.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
