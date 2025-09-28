'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { intentRouterAPI } from '@/lib/api/intent-router'
import type {
  ManifestDetail,
  ManifestRefreshJob,
  ManifestSummary,
  RefreshOptions,
} from '@/lib/api/intent-router'

type QueryState<T> = {
  data: T | undefined
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

type MutationState<TArgs> = {
  isPending: boolean
  error: string | null
  mutate: (args: TArgs) => Promise<void>
}

export function useManifestRefresher(selectedService?: string) {
  const [summariesState, setSummariesState] = useState<QueryState<ManifestSummary[]>>({
    data: undefined,
    isLoading: true,
    error: null,
    refetch: async () => {}
  })

  const [detailState, setDetailState] = useState<QueryState<ManifestDetail>>({
    data: undefined,
    isLoading: Boolean(selectedService),
    error: null,
    refetch: async () => {}
  })

  const [jobsState, setJobsState] = useState<QueryState<ManifestRefreshJob[]>>({
    data: undefined,
    isLoading: true,
    error: null,
    refetch: async () => {}
  })

  const loadSummaries = useCallback(async () => {
    setSummariesState((prev) => ({ ...prev, isLoading: true }))
    try {
      const data = await intentRouterAPI.listManifests()
      setSummariesState((prev) => ({ ...prev, data, isLoading: false, error: null }))
    } catch (error) {
      console.error(error)
      setSummariesState((prev) => ({ ...prev, data: undefined, isLoading: false, error: 'マニフェスト一覧の取得に失敗しました。' }))
    }
  }, [])

  const loadDetail = useCallback(async () => {
    if (!selectedService) {
      setDetailState({ data: undefined, isLoading: false, error: null, refetch: loadDetail })
      return
    }

    setDetailState((prev) => ({ ...prev, isLoading: true }))
    try {
      const data = await intentRouterAPI.getManifestDetail(selectedService)
      setDetailState((prev) => ({ ...prev, data, isLoading: false, error: null }))
    } catch (error) {
      console.error(error)
      setDetailState((prev) => ({ ...prev, data: undefined, isLoading: false, error: 'マニフェスト詳細の取得に失敗しました。' }))
    }
  }, [selectedService])

  const loadJobs = useCallback(async () => {
    setJobsState((prev) => ({ ...prev, isLoading: true }))
    try {
      const data = await intentRouterAPI.getManifestJobs()
      setJobsState((prev) => ({ ...prev, data, isLoading: false, error: null }))
    } catch (error) {
      console.error(error)
      setJobsState((prev) => ({ ...prev, data: undefined, isLoading: false, error: 'ジョブ履歴の取得に失敗しました。' }))
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const initialise = async () => {
      if (!isMounted) return
      await loadSummaries()
      await loadJobs()
    }

    initialise()
    const summariesInterval = setInterval(loadSummaries, 120_000)
    const jobsInterval = setInterval(loadJobs, 90_000)

    return () => {
      isMounted = false
      clearInterval(summariesInterval)
      clearInterval(jobsInterval)
    }
  }, [loadSummaries, loadJobs])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  // Inject refetch helpers
  useEffect(() => {
    setSummariesState((prev) => ({ ...prev, refetch: loadSummaries }))
  }, [loadSummaries])

  useEffect(() => {
    setDetailState((prev) => ({ ...prev, refetch: loadDetail }))
  }, [loadDetail])

  useEffect(() => {
    setJobsState((prev) => ({ ...prev, refetch: loadJobs }))
  }, [loadJobs])

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [isApproving, setIsApproving] = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [isRollingBack, setIsRollingBack] = useState(false)
  const [rollbackError, setRollbackError] = useState<string | null>(null)

  const refreshMutation: MutationState<RefreshOptions & { service: string }> = {
    isPending: isRefreshing,
    error: refreshError,
    mutate: async (options) => {
      setIsRefreshing(true)
      setRefreshError(null)
      try {
        await intentRouterAPI.triggerManifestRefresh(options.service, options)
        await Promise.all([loadSummaries(), loadJobs(), loadDetail()])
      } catch (error) {
        console.error(error)
        setRefreshError('リフレッシュの実行に失敗しました。')
      } finally {
        setIsRefreshing(false)
      }
    },
  }

  const approveMutation: MutationState<string> = {
    isPending: isApproving,
    error: approveError,
    mutate: async (jobId) => {
      setIsApproving(true)
      setApproveError(null)
      try {
        const job = await intentRouterAPI.approveManifestJob(jobId)
        await Promise.all([loadSummaries(), loadJobs(), loadDetail()])
        if (job) {
          console.info('Manifest job approved', job.id)
        }
      } catch (error) {
        console.error(error)
        setApproveError('承認に失敗しました。')
      } finally {
        setIsApproving(false)
      }
    },
  }

  const rollbackMutation: MutationState<string> = {
    isPending: isRollingBack,
    error: rollbackError,
    mutate: async (jobId) => {
      setIsRollingBack(true)
      setRollbackError(null)
      try {
        const job = await intentRouterAPI.rollbackManifestJob(jobId)
        await Promise.all([loadSummaries(), loadJobs(), loadDetail()])
        if (job) {
          console.info('Manifest job rolled back', job.id)
        }
      } catch (error) {
        console.error(error)
        setRollbackError('ロールバックに失敗しました。')
      } finally {
        setIsRollingBack(false)
      }
    },
  }

  const latestJobByService = useMemo(() => {
    if (!jobsState.data) return new Map<string, ManifestRefreshJob>()
    return jobsState.data.reduce((map, job) => {
      const previous = map.get(job.service)
      if (!previous || previous.updatedAt < job.updatedAt) {
        map.set(job.service, job)
      }
      return map
    }, new Map<string, ManifestRefreshJob>())
  }, [jobsState.data])

  return {
    summariesQuery: summariesState,
    detailQuery: detailState,
    jobsQuery: jobsState,
    latestJobByService,
    refreshMutation,
    approveMutation,
    rollbackMutation,
  }
}
