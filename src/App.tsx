import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import type { Project, Task } from './types/types'
import { getProjectTasks, getProjects } from './api'

const ROW_HEIGHT = 48

function parseDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value: Date | string | null) {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '—'
  return date.toLocaleDateString()
}

function formatShortDate(value: Date | null) {
  if (!value) return '—'
  return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function compareTasks(a: Task, b: Task) {
  const aStart = parseDate(a.startDate)?.getTime() ?? Number.POSITIVE_INFINITY
  const bStart = parseDate(b.startDate)?.getTime() ?? Number.POSITIVE_INFINITY
  if (aStart !== bStart) return aStart - bStart
  return a.name.localeCompare(b.name)
}

function buildTaskRows(tasks: Task[]) {
  const byParent = new Map<number | null, Task[]>()
  tasks.forEach((task) => {
    const key = task.parentTaskId ?? null
    const group = byParent.get(key)
    if (group) {
      group.push(task)
    } else {
      byParent.set(key, [task])
    }
  })

  const rows: Array<{ task: Task; depth: number; number: string }> = []
  const visit = (task: Task, depth: number, number: string) => {
    rows.push({ task, depth, number })
    const children = (byParent.get(task.id) ?? []).slice().sort(compareTasks)
    children.forEach((child, index) => visit(child, depth + 1, `${number}.${index + 1}`))
  }

  const roots = (byParent.get(null) ?? []).slice().sort(compareTasks)
  roots.forEach((root, index) => visit(root, 0, `${index + 1}`))

  return rows
}

function getTaskRange(task: Task) {
  const start = parseDate(task.startDate)
  const end = parseDate(task.dueDate) ?? start
  if (!start || !end) return null
  return { start, end }
}

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [tasksError, setTasksError] = useState<string | null>(null)
  const [isProjectsLoading, setIsProjectsLoading] = useState(true)
  const [isTasksLoading, setIsTasksLoading] = useState(false)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const [timelineWidth, setTimelineWidth] = useState(0)

  useEffect(() => {
    let isActive = true

    const loadProjects = async () => {
      setProjectsError(null)
      setIsProjectsLoading(true)

      try {
        const data = await getProjects()
        if (!isActive) return
        setProjects(data)
        setSelectedProjectId((current) => current ?? data[0]?.id ?? null)
      } catch (error) {
        if (!isActive) return
        setProjectsError(error instanceof Error ? error.message : 'Failed to load projects')
      } finally {
        if (isActive) {
          setIsProjectsLoading(false)
        }
      }
    }

    void loadProjects()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    if (selectedProjectId === null) return

    let isActive = true

    const loadTasks = async () => {
      setTasksError(null)
      setIsTasksLoading(true)

      try {
        const data = await getProjectTasks(selectedProjectId)
        if (!isActive) return
        setTasks(data)
      } catch (error) {
        if (!isActive) return
        setTasksError(error instanceof Error ? error.message : 'Failed to load tasks')
      } finally {
        if (isActive) {
          setIsTasksLoading(false)
        }
      }
    }

    void loadTasks()

    return () => {
      isActive = false
    }
  }, [selectedProjectId])

  useLayoutEffect(() => {
    const element = timelineRef.current
    if (!element) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setTimelineWidth(entry.contentRect.width)
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

  const taskRows = useMemo(() => buildTaskRows(tasks), [tasks])
  const taskIndexById = useMemo(() => {
    const map = new Map<number, number>()
    taskRows.forEach((row, index) => map.set(row.task.id, index))
    return map
  }, [taskRows])

  const timelineRange = useMemo(() => {
    const ranges = tasks.map(getTaskRange).filter(Boolean) as Array<{ start: Date; end: Date }>
    if (ranges.length === 0) return null

    const startMs = Math.min(...ranges.map((range) => range.start.getTime()))
    const endMs = Math.max(...ranges.map((range) => range.end.getTime()))
    const start = new Date(startMs)
    const end = new Date(endMs)

    return { start, end, startMs, endMs }
  }, [tasks])

  const timelineTicks = useMemo(() => {
    if (!timelineRange) return []
    const tickCount = 4
    const ticks: Array<{ label: string; position: number }> = []
    const rangeMs = Math.max(1, timelineRange.endMs - timelineRange.startMs)

    for (let i = 0; i <= tickCount; i += 1) {
      const ratio = i / tickCount
      const tickDate = new Date(timelineRange.startMs + rangeMs * ratio)
      ticks.push({ label: formatShortDate(tickDate), position: ratio * 100 })
    }

    return ticks
  }, [timelineRange])

  const dependencyLines = useMemo(() => {
    if (!timelineRange || timelineWidth === 0) return []
    const rangeMs = Math.max(1, timelineRange.endMs - timelineRange.startMs)

    const toX = (date: Date) => ((date.getTime() - timelineRange.startMs) / rangeMs) * timelineWidth
    const toY = (index: number) => index * ROW_HEIGHT + ROW_HEIGHT / 2

    const lines: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = []

    taskRows.forEach((row, rowIndex) => {
      const taskRange = getTaskRange(row.task)
      if (!taskRange) return

      row.task.dependsOn.forEach((dependencyId) => {
        const dependencyIndex = taskIndexById.get(dependencyId)
        if (dependencyIndex === undefined) return
        const dependencyTask = taskRows[dependencyIndex]?.task
        if (!dependencyTask) return

        const dependencyRange = getTaskRange(dependencyTask)
        if (!dependencyRange) return

        lines.push({
          id: `${dependencyId}-${row.task.id}`,
          x1: toX(dependencyRange.end),
          y1: toY(dependencyIndex),
          x2: toX(taskRange.start),
          y2: toY(rowIndex),
        })
      })
    })

    return lines
  }, [taskIndexById, taskRows, timelineRange, timelineWidth])

  const timelineRangeLabel = timelineRange
    ? `${formatDate(timelineRange.start)} - ${formatDate(timelineRange.end)}`
    : 'No scheduled dates'

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <p className="app__eyebrow">Project Insights</p>
          <h1 className="app__title">Task Timeline</h1>
        </div>
        <div className="app__meta">
          <span>API: {import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4500'}</span>
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
            <h2>Gantt view</h2>
            <span className="panel__muted">{timelineRangeLabel}</span>
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

          {!isTasksLoading && !tasksError && taskRows.length === 0 && (
            <p className="panel__muted">No tasks available for this project.</p>
          )}

          {taskRows.length > 0 && (
            <div className="gantt">
              <div className="gantt__header">
                <span>Task</span>
                <div className="gantt__axis" aria-hidden="true">
                  {timelineTicks.map((tick) => (
                    <span key={tick.position} style={{ left: `${tick.position}%` }}>
                      {tick.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="gantt__body">
                <div className="gantt__tasks">
                  {taskRows.map(({ task, depth, number }) => (
                    <div key={task.id} className="gantt__row" style={{ paddingLeft: `${depth * 16}px` }}>
                      <div>
                        <p className="gantt__task-name">{number}. {task.name}</p>
                        <p className="panel__muted">
                          {task.status} • Start {formatDate(task.startDate)} • Due {formatDate(task.dueDate)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="gantt__timeline" ref={timelineRef}>
                  <div className="gantt__grid" aria-hidden="true">
                    {timelineTicks.map((tick) => (
                      <span key={tick.position} style={{ left: `${tick.position}%` }} />
                    ))}
                  </div>

                  <svg
                    className="gantt__overlay"
                    width={timelineWidth}
                    height={taskRows.length * ROW_HEIGHT}
                    viewBox={`0 0 ${timelineWidth} ${taskRows.length * ROW_HEIGHT}`}
                  >
                    <defs>
                      <marker
                        id="arrow"
                        markerWidth="8"
                        markerHeight="8"
                        refX="6"
                        refY="3"
                        orient="auto"
                      >
                        <path d="M0,0 L0,6 L6,3 z" fill="#94a3b8" />
                      </marker>
                    </defs>
                    {dependencyLines.map((line) => (
                      <line
                        key={line.id}
                        x1={line.x1}
                        y1={line.y1}
                        x2={line.x2}
                        y2={line.y2}
                        stroke="#94a3b8"
                        strokeWidth="1"
                        markerEnd="url(#arrow)"
                      />
                    ))}
                  </svg>

                  <div className="gantt__bars" aria-hidden="true">
                    {taskRows.map(({ task }, index) => {
                      const range = getTaskRange(task)
                      if (!range || !timelineRange) return <span key={task.id} className="gantt__bar" />
                      const rangeMs = Math.max(1, timelineRange.endMs - timelineRange.startMs)
                      const left = ((range.start.getTime() - timelineRange.startMs) / rangeMs) * 100
                      const width = ((range.end.getTime() - range.start.getTime()) / rangeMs) * 100
                      const barWidth = Math.max(width, 1)

                      return (
                        <span
                          key={task.id}
                          className={`gantt__bar gantt__bar--${task.status.replace(' ', '-')}`}
                          style={{
                            top: `${index * ROW_HEIGHT + ROW_HEIGHT / 2 - 8}px`,
                            left: `${left}%`,
                            width: `${barWidth}%`,
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
