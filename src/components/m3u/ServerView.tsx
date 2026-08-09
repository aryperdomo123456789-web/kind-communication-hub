import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Server,
  Shield,
  Download,
  CheckCircle2,
  Loader2,
  Terminal,
  Copy,
  Check,
  List,
  RefreshCw,
  FolderOpen,
  Tv2,
  FileVideo,
  Trash2,
  CircleDashed,
  ArrowUp,
  ArrowDown,
  Repeat2,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  activateSavedFlussonicProfile,
  type DownloadJobEventRecord,
  deleteFlussonicCategory,
  deleteFlussonicChannel,
  deleteSavedFlussonicProfile,
  fetchFlussonicMirror,
  fetchFlussonicStreams,
  fetchLatestFlussonicDownloadJobStatus,
  generateFlussonicPublicPlaylist,
  loadFlussonicConnectionProfile,
  fetchFlussonicDownloadJobTrace,
  publishFlussonicDownloadJob,
  refreshFlussonicConnectionProfile,
  resumeFlussonicDownloadJob,
  startFlussonicDownloadJob,
  fetchFlussonicDownloadJobStatus,
  connectSsh as validateSshConnection,
  type SshResponse,
} from "@/lib/ssh.functions";
import {
  FlussonicConnectionHealth,
  FlussonicConnectionProfile,
  FlussonicStreamInfo,
  FlussonicMirrorSnapshot,
  FlussonicDownloadJobStatus,
  M3UItem,
} from "@/lib/m3u/types";

interface ServerViewProps {
  panelUsername: string;
  customCategories: Record<string, M3UItem[]>;
  onFlussonicStreamsChange: (streams: FlussonicStreamInfo[]) => void;
  flussonicStreams: FlussonicStreamInfo[];
  flussonicMirror: FlussonicMirrorSnapshot | null;
  onFlussonicMirrorChange: (snapshot: FlussonicMirrorSnapshot | null) => void;
}

export function ServerView({
  panelUsername,
  customCategories,
  onFlussonicStreamsChange,
  flussonicStreams,
  flussonicMirror,
  onFlussonicMirrorChange,
}: ServerViewProps) {
  const [serverIp, setServerIp] = useState(() => {
    if (typeof window === "undefined") return "173.208.244.141";
    return localStorage.getItem("mago_flussonic_server_ip") || "173.208.244.141";
  });
  const [profileName, setProfileName] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("mago_flussonic_profile_name") || "";
  });
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<FlussonicConnectionProfile[]>([]);
  const [sshUser, setSshUser] = useState(() => {
    if (typeof window === "undefined") return "root";
    return localStorage.getItem("mago_flussonic_ssh_user") || "root";
  });
  const [sshPort, setSshPort] = useState(() => {
    if (typeof window === "undefined") return "22";
    return localStorage.getItem("mago_flussonic_ssh_port") || "22";
  });
  const [sshPassword, setSshPassword] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("mago_flussonic_ssh_password") || "";
  });
  const [apiBaseUrl, setApiBaseUrl] = useState(() => {
    if (typeof window === "undefined") return "http://173.208.244.141";
    return localStorage.getItem("mago_flussonic_api_base_url") || "http://173.208.244.141";
  });
  const [apiUsername, setApiUsername] = useState(() => {
    if (typeof window === "undefined") return "admin";
    return localStorage.getItem("mago_flussonic_api_username") || "admin";
  });
  const [apiPassword, setApiPassword] = useState(() => {
    if (typeof window === "undefined") return "admin";
    return localStorage.getItem("mago_flussonic_api_password") || "admin";
  });
  const [apiStreamsPath, setApiStreamsPath] = useState(() => {
    if (typeof window === "undefined") return "/streamer/api/v3/streams";
    return localStorage.getItem("mago_flussonic_api_streams_path") || "/streamer/api/v3/streams";
  });
  const [sshStatus, setSshStatus] = useState<"disconnected" | "connecting" | "connected">(
    "disconnected",
  );
  const [connectionHealth, setConnectionHealth] = useState<FlussonicConnectionHealth | null>(null);
  const [downloadingCategory, setDownloadingCategory] = useState<string | null>(null);
  const [publishingJobId, setPublishingJobId] = useState<string | null>(null);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [loadingMirror, setLoadingMirror] = useState(false);
  const [loadingApiStreams, setLoadingApiStreams] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playlistCopied, setPlaylistCopied] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [downloadJob, setDownloadJob] = useState<FlussonicDownloadJobStatus | null>(null);
  const [downloadJobEvents, setDownloadJobEvents] = useState<DownloadJobEventRecord[]>([]);
  const [jobInProgress, setJobInProgress] = useState(false);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadSourceCategory, setDownloadSourceCategory] = useState("");
  const [downloadTargetMode, setDownloadTargetMode] = useState<"existing" | "new">("existing");
  const [downloadExistingCategory, setDownloadExistingCategory] = useState("");
  const [downloadNewCategory, setDownloadNewCategory] = useState("");
  const [downloadChannelName, setDownloadChannelName] = useState("");
  const [downloadSelectedItemIds, setDownloadSelectedItemIds] = useState<string[]>([]);
  const [downloadQueueOrder, setDownloadQueueOrder] = useState<string[]>([]);
  const [downloadItemSearch, setDownloadItemSearch] = useState("");
  const [apiStreamsEndpoint, setApiStreamsEndpoint] = useState("");
  const [apiStreams, setApiStreams] = useState<string[]>([]);
  const [publicPlaylist, setPublicPlaylist] = useState("");
  const [publicPlaylistEndpoint, setPublicPlaylistEndpoint] = useState("");
  const jobPollRef = useRef<number | null>(null);
  const jobStatusPollInFlightRef = useRef(false);
  const restoreJobAttemptedRef = useRef(false);
  const syncFn = useServerFn(fetchFlussonicStreams);
  const mirrorFn = useServerFn(fetchFlussonicMirror);
  const deleteChannelFn = useServerFn(deleteFlussonicChannel);
  const deleteCategoryFn = useServerFn(deleteFlussonicCategory);
  const startJobFn = useServerFn(startFlussonicDownloadJob);
  const resumeJobFn = useServerFn(resumeFlussonicDownloadJob);
  const publishJobFn = useServerFn(publishFlussonicDownloadJob);
  const readJobStatusFn = useServerFn(fetchFlussonicDownloadJobStatus);
  const latestJobFn = useServerFn(fetchLatestFlussonicDownloadJobStatus);
  const apiStreamsFn = useServerFn(fetchFlussonicStreams);
  const publicPlaylistFn = useServerFn(generateFlussonicPublicPlaylist);
  const loadProfileFn = useServerFn(loadFlussonicConnectionProfile);
  const refreshProfileFn = useServerFn(refreshFlussonicConnectionProfile);
  const deleteProfileFn = useServerFn(deleteSavedFlussonicProfile);
  const activateProfileFn = useServerFn(activateSavedFlussonicProfile);

  const setupCommand = `mkdir -p /opt/flussonic/priv && grep -q '^vod vod {' /etc/flussonic/flussonic.conf || cat << 'EOF' >> /etc/flussonic/flussonic.conf

vod vod {
  storage /opt/flussonic/priv;
}

EOF
service flussonic reload`;

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(setupCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const validateSshFn = useServerFn(validateSshConnection);

  const getConnectionConfig = useCallback(
    (profileOverride?: Partial<FlussonicConnectionProfile>) => {
      const nextServerIp = profileOverride?.serverIp ?? serverIp;
      const nextSshUser = profileOverride?.sshUser ?? sshUser;
      const nextSshPassword = profileOverride?.sshPassword ?? sshPassword;
      const nextSshPort = profileOverride?.sshPort ?? parseInt(sshPort);
      const nextApiBaseUrl = profileOverride?.apiBaseUrl ?? apiBaseUrl;
      const nextApiUsername = profileOverride?.apiUsername ?? apiUsername;
      const nextApiPassword = profileOverride?.apiPassword ?? apiPassword;
      const nextApiStreamsPath = profileOverride?.apiStreamsPath ?? apiStreamsPath;

      return {
        serverIp: nextServerIp,
        sshUser: nextSshUser,
        sshPassword: nextSshPassword,
        sshPort: nextSshPort,
        apiBaseUrl: nextApiBaseUrl,
        apiUsername: nextApiUsername,
        apiPassword: nextApiPassword,
        apiStreamsPath: nextApiStreamsPath,
      };
    },
    [apiBaseUrl, apiPassword, apiStreamsPath, apiUsername, serverIp, sshPassword, sshPort, sshUser],
  );

  const persistConnectionSnapshot = useCallback(
    (snapshot: {
      serverIp: string;
      sshUser: string;
      sshPort: number;
      sshPassword: string;
      apiBaseUrl: string;
      apiUsername: string;
      apiPassword: string;
      apiStreamsPath: string;
      lastConnectedAt: string;
    }) => {
      localStorage.setItem("mago_flussonic_saved_connection", JSON.stringify(snapshot));
    },
    [],
  );

  const downloadJobStorageKey = `mago_flussonic_active_download_job_id:${panelUsername}`;

  const syncDownloadJobTrace = useCallback(
    async (jobId: string) => {
      try {
        const result = (await fetchFlussonicDownloadJobTrace({
          data: { jobId },
        })) as {
          success: boolean;
          message: string;
          events: DownloadJobEventRecord[];
          status: FlussonicDownloadJobStatus | null;
        };

        if (result.success) {
          setDownloadJobEvents(result.events || []);
        }
      } catch (error) {
        console.error("Falha ao carregar trilha do job:", error);
      }
    },
    [],
  );

  const cacheActiveDownloadJobId = useCallback(
    (jobId: string | null) => {
      if (typeof window === "undefined") return;
      if (jobId) {
        localStorage.setItem(downloadJobStorageKey, jobId);
      } else {
        localStorage.removeItem(downloadJobStorageKey);
      }
    },
    [downloadJobStorageKey],
  );

  const withTimeout = useCallback(async <T,>(promise: Promise<T>, timeoutMs: number, label: string) => {
    let timeoutId: number | undefined;
    const timeout = new Promise<T>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(`${label} demorou demais`)), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    }
  }, []);

  const describeError = useCallback((error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    if (typeof error === "string" && error.trim()) {
      return error;
    }

    return fallback;
  }, []);

  const filteredDownloadItems = useMemo(() => {
    if (!downloadJob) return [];
    const query = downloadItemSearch.trim().toLowerCase();
    if (!query) return downloadJob.items;
    return downloadJob.items.filter((item) => {
      const haystack = `${item.name} ${item.fileName} ${item.url}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [downloadItemSearch, downloadJob]);

  const applyProfileToForm = (profile: FlussonicConnectionProfile) => {
    setServerIp(profile.serverIp);
    setSshUser(profile.sshUser);
    setSshPort(String(profile.sshPort));
    setSshPassword(profile.sshPassword || "");
    setApiBaseUrl(profile.apiBaseUrl || `http://${profile.serverIp}`);
    setApiUsername(profile.apiUsername || "admin");
    setApiPassword(profile.apiPassword || "admin");
    setApiStreamsPath(profile.apiStreamsPath || "/streamer/api/v3/streams");
    setConnectionHealth(profile.lastHealth ?? null);
    setSshStatus(profile.lastHealth?.sshOk ? "connected" : "disconnected");
  };

  const loadFlussonicStreams = useCallback(
    async (profileOverride?: Partial<FlussonicConnectionProfile>) => {
      setLoadingStreams(true);
      const {
        serverIp: nextServerIp,
        sshUser: nextSshUser,
        sshPassword: nextSshPassword,
        sshPort: nextSshPort,
      } = getConnectionConfig(profileOverride);
      try {
        const result = (await withTimeout(
          syncFn({
            data: {
              serverIp: nextServerIp,
              sshUser: nextSshUser,
              sshPassword: nextSshPassword,
              sshPort: nextSshPort,
              flussonicConfPath: "/etc/flussonic/flussonic.conf",
            },
          }) as Promise<any>,
          30000,
          "Leitura das categorias",
        )) as any;

        if (result.success) {
          onFlussonicStreamsChange(result.streams);
        } else {
          alert("Falha ao ler categorias do Flussonic: " + result.message);
        }
      } catch (error) {
        console.error(error);
        alert(`Erro ao ler categorias do Flussonic: ${describeError(error, "erro desconhecido")}`);
      } finally {
        setLoadingStreams(false);
      }
    },
    [describeError, getConnectionConfig, onFlussonicStreamsChange, syncFn, withTimeout],
  );

  const loadFlussonicMirror = useCallback(
    async (profileOverride?: Partial<FlussonicConnectionProfile>) => {
      setLoadingMirror(true);
      const {
        serverIp: nextServerIp,
        sshUser: nextSshUser,
        sshPassword: nextSshPassword,
        sshPort: nextSshPort,
      } = getConnectionConfig(profileOverride);
      try {
        const result = (await withTimeout(
          mirrorFn({
            data: {
              serverIp: nextServerIp,
              sshUser: nextSshUser,
              sshPassword: nextSshPassword,
              sshPort: nextSshPort,
              flussonicConfPath: "/etc/flussonic/flussonic.conf",
            },
          }) as Promise<{ success: boolean; message: string; snapshot: FlussonicMirrorSnapshot | null }>,
          30000,
          "Sincronização da árvore",
        )) as { success: boolean; message: string; snapshot: FlussonicMirrorSnapshot | null };

        if (result.success) {
          onFlussonicMirrorChange(result.snapshot);
          onFlussonicStreamsChange(result.snapshot?.streams || []);
        } else {
          alert("Falha ao sincronizar espelho: " + result.message);
        }
      } catch (error) {
        console.error(error);
        alert(`Erro ao sincronizar espelho do Flussonic: ${describeError(error, "erro desconhecido")}`);
      } finally {
        setLoadingMirror(false);
      }
    },
    [describeError, getConnectionConfig, mirrorFn, onFlussonicMirrorChange, onFlussonicStreamsChange, withTimeout],
  );

  const resolveProfileForSync = useCallback(
    async (profileOverride?: Partial<FlussonicConnectionProfile>) => {
      if (profileOverride?.serverIp) {
        return profileOverride;
      }

      try {
        const result = (await loadProfileFn({
          data: { panelUsername },
        })) as {
          success: boolean;
          profile: FlussonicConnectionProfile | null;
        };

        if (result.success && result.profile) {
          return result.profile;
        }
      } catch (error) {
        console.warn("Falha ao carregar perfil salvo para sincronização:", error);
      }

      return profileOverride;
    },
    [loadProfileFn, panelUsername],
  );

  const syncMirrorAndStreams = useCallback(
    async (profileOverride?: Partial<FlussonicConnectionProfile>) => {
      const resolvedProfile = await resolveProfileForSync(profileOverride);
      await loadFlussonicMirror(resolvedProfile);
      await loadFlussonicStreams(resolvedProfile);
    },
    [loadFlussonicMirror, loadFlussonicStreams, resolveProfileForSync],
  );

  const refreshMirrorAfterMutation = useCallback(
    async (contextLabel: string) => {
      try {
        await syncMirrorAndStreams();
      } catch (error) {
        console.warn(`Falha ao atualizar o espelho após ${contextLabel}:`, error);
      }
    },
    [syncMirrorAndStreams],
  );

  const reconcileMirrorAfterFailedMutation = useCallback(
    async (contextLabel: string) => {
      try {
        await syncMirrorAndStreams();
      } catch (error) {
        console.warn(`Falha ao reconciliar o espelho após ${contextLabel}:`, error);
      }
    },
    [syncMirrorAndStreams],
  );

  useEffect(() => {
    localStorage.setItem("mago_flussonic_server_ip", serverIp);
    localStorage.setItem("mago_flussonic_profile_name", profileName);
    localStorage.setItem("mago_flussonic_ssh_user", sshUser);
    localStorage.setItem("mago_flussonic_ssh_port", sshPort);
    localStorage.setItem("mago_flussonic_ssh_password", sshPassword);
    localStorage.setItem("mago_flussonic_api_base_url", apiBaseUrl);
    localStorage.setItem("mago_flussonic_api_username", apiUsername);
    localStorage.setItem("mago_flussonic_api_password", apiPassword);
    localStorage.setItem("mago_flussonic_api_streams_path", apiStreamsPath);
  }, [apiBaseUrl, apiPassword, apiStreamsPath, apiUsername, serverIp, profileName, sshUser, sshPort, sshPassword]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("mago_flussonic_saved_connection");
      if (!saved) return;

      const parsed = JSON.parse(saved) as {
        serverIp?: string;
        sshUser?: string;
        sshPort?: string;
        sshPassword?: string;
        apiBaseUrl?: string;
        apiUsername?: string;
        apiPassword?: string;
        apiStreamsPath?: string;
      };

      if (parsed.serverIp) setServerIp(parsed.serverIp);
      if (parsed.sshUser) setSshUser(parsed.sshUser);
      if (parsed.sshPort) setSshPort(parsed.sshPort);
      if (parsed.sshPassword !== undefined) setSshPassword(parsed.sshPassword);
      if (parsed.apiBaseUrl) setApiBaseUrl(parsed.apiBaseUrl);
      if (parsed.apiUsername) setApiUsername(parsed.apiUsername);
      if (parsed.apiPassword !== undefined) setApiPassword(parsed.apiPassword);
      if (parsed.apiStreamsPath) setApiStreamsPath(parsed.apiStreamsPath);
    } catch {
      // Mantém os valores atuais se o cache salvo estiver inválido.
    }
  }, []);

  useEffect(() => {
    restoreJobAttemptedRef.current = false;
    setDownloadJob(null);
    setDownloadJobEvents([]);
    setJobInProgress(false);
  }, [panelUsername]);

  useEffect(() => {
    if (restoreJobAttemptedRef.current) return;
    restoreJobAttemptedRef.current = true;

    let isActive = true;

    const restoreActiveJob = async () => {
      try {
        const storedJobId = typeof window === "undefined" ? "" : localStorage.getItem(downloadJobStorageKey) || "";

        const loadStatus = async (jobId: string) =>
          (await withTimeout(
            readJobStatusFn({
              data: { jobId },
            }) as Promise<{ success: boolean; message: string; status: FlussonicDownloadJobStatus | null }>,
            10000,
            "Restauração do job",
          )) as { success: boolean; message: string; status: FlussonicDownloadJobStatus | null };

        const resumeIfNeeded = async (status: FlussonicDownloadJobStatus, jobId: string) => {
          if (!isActive) return false;

          setDownloadJob(status);
          setJobInProgress(status.state === "queued" || status.state === "running");
          cacheActiveDownloadJobId(
            status.state === "completed" || status.state === "failed" ? null : jobId,
          );
          await syncDownloadJobTrace(jobId);

          if (status.state === "queued" || status.state === "running") {
            try {
              await resumeJobFn({
                data: {
                  jobId,
                },
              });
            } catch (error) {
              console.error("Falha ao retomar job:", error);
            }
          }

          return true;
        };

        if (storedJobId) {
          const storedResult = await loadStatus(storedJobId);
          if (storedResult.success && storedResult.status) {
            const handled = await resumeIfNeeded(storedResult.status, storedJobId);
            if (handled) return;
          }
        }

        const latestResult = (await withTimeout(
          latestJobFn({
            data: { panelUsername },
          }) as Promise<{ success: boolean; message: string; status: FlussonicDownloadJobStatus | null }>,
          10000,
          "Busca do job ativo",
        )) as { success: boolean; message: string; status: FlussonicDownloadJobStatus | null };

        if (latestResult.success && latestResult.status) {
          const handled = await resumeIfNeeded(latestResult.status, latestResult.status.jobId);
          if (handled) return;
        }

        cacheActiveDownloadJobId(null);
      } catch (error) {
        console.error("Falha ao restaurar job ativo:", error);
        cacheActiveDownloadJobId(null);
      }
    };

    void restoreActiveJob();

    return () => {
      isActive = false;
    };
  }, [
    panelUsername,
    downloadJobStorageKey,
    readJobStatusFn,
    latestJobFn,
    syncDownloadJobTrace,
    cacheActiveDownloadJobId,
    resumeJobFn,
  ]);

  useEffect(() => {
    let isActive = true;

    const hydrateConnection = async () => {
      try {
        const result = (await loadProfileFn({
          data: { panelUsername },
        })) as {
          success: boolean;
          message: string;
          profile: FlussonicConnectionProfile | null;
          profiles: FlussonicConnectionProfile[];
        };

        if (!isActive) return;

        if (result.success && Array.isArray(result.profiles)) {
          setSavedProfiles(result.profiles);
        }

        if (!result.success || !result.profile) return;

        applyProfileToForm(result.profile);
        setSelectedProfileId(result.profile.profileId ?? null);
        setProfileName(result.profile.profileName || result.profile.serverIp);
        localStorage.setItem("mago_flussonic_auto_connect", "1");
        persistConnectionSnapshot({
          serverIp: result.profile.serverIp,
          sshUser: result.profile.sshUser,
          sshPort: result.profile.sshPort,
          sshPassword: result.profile.sshPassword,
          apiBaseUrl: result.profile.apiBaseUrl,
          apiUsername: result.profile.apiUsername,
          apiPassword: result.profile.apiPassword,
          apiStreamsPath: result.profile.apiStreamsPath,
          lastConnectedAt: result.profile.lastHealth?.lastCheckedAt || result.profile.updatedAt,
        });

        if (result.profile.lastHealth?.state === "connected") {
          setSshStatus("connected");
          await syncMirrorAndStreams(result.profile);
        } else {
          await handleConnect(true, result.profile);
        }
      } catch (error) {
        console.error(error);
      }
    };

    void hydrateConnection();

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelUsername]);

  const handleConnect = async (
    silent = false,
    profileOverride?: Partial<FlussonicConnectionProfile>,
  ) => {
    setSshStatus("connecting");
    const {
      serverIp: nextServerIp,
      sshUser: nextSshUser,
      sshPassword: nextSshPassword,
      sshPort: nextSshPort,
    } = getConnectionConfig(profileOverride);
    const nextApiBaseUrl = (profileOverride?.apiBaseUrl ?? apiBaseUrl?.trim()) || `http://${nextServerIp}`;
    const nextApiUsername = profileOverride?.apiUsername ?? apiUsername;
    const nextApiPassword = profileOverride?.apiPassword ?? apiPassword;
    const nextApiStreamsPath = profileOverride?.apiStreamsPath ?? apiStreamsPath;
    const nextProfileId = profileOverride?.profileId ?? selectedProfileId ?? undefined;
    const nextProfileName = profileOverride?.profileName ?? (profileName.trim() || nextServerIp);

    try {
      const result = (await validateSshFn({
        data: {
          host: nextServerIp,
          port: nextSshPort,
          username: nextSshUser,
          password: nextSshPassword || '',
          panelUsername,
          apiBaseUrl: nextApiBaseUrl,
          apiUsername: nextApiUsername,
          apiPassword: nextApiPassword,
          apiStreamsPath: nextApiStreamsPath,
          profileId: nextProfileId,
          profileName: nextProfileName,
        },
      })) as {
        success: boolean;
        message: string;
        health: FlussonicConnectionHealth | null;
        profile: FlussonicConnectionProfile | null;
        profiles: FlussonicConnectionProfile[];
      };

      if (result.success) {
        const refreshed = result;

        if (refreshed.profile) {
          applyProfileToForm(refreshed.profile);
          setSavedProfiles(refreshed.profiles ?? []);
          setSelectedProfileId(refreshed.profile.profileId ?? null);
          setProfileName(refreshed.profile.profileName || nextProfileName);
        } else {
          setSshStatus("connected");
        }

        localStorage.setItem("mago_flussonic_auto_connect", "1");
        persistConnectionSnapshot({
          serverIp: nextServerIp,
          sshUser: nextSshUser,
          sshPort: nextSshPort,
          sshPassword: nextSshPassword,
          apiBaseUrl: nextApiBaseUrl,
          apiUsername: nextApiUsername,
          apiPassword: nextApiPassword,
          apiStreamsPath: nextApiStreamsPath,
          lastConnectedAt: refreshed.health?.lastCheckedAt || new Date().toISOString(),
        });
        try {
          await syncMirrorAndStreams(refreshed.profile ?? profileOverride);
        } catch (syncError) {
          console.warn("Falha ao sincronizar espelho após conexão:", syncError);
        }
      } else {
        localStorage.setItem("mago_flussonic_auto_connect", "0");
        if (!silent) alert("Falha na conexão: " + result.message);
        setSshStatus("disconnected");
      }
    } catch (error) {
      console.error(error);
      localStorage.setItem("mago_flussonic_auto_connect", "0");
      if (!silent) alert("Erro ao tentar conectar via SSH. Verifique se os dados estão corretos.");
      setSshStatus("disconnected");
    }
  };

  const handleLoadApiStreams = async () => {
    setLoadingApiStreams(true);
    try {
      const result = (await apiStreamsFn({
        data: {
          serverIp,
          apiBaseUrl,
          apiUsername,
          apiPassword,
          apiStreamsPath,
        },
      })) as any;

      if (!result.success) {
        alert(result.message);
        return;
      }

      setApiStreamsEndpoint(result.endpoint);
      setApiStreams(result.streams.map((stream: { name: string }) => stream.name));
      setPublicPlaylist("");
      setPublicPlaylistEndpoint("");
      alert(result.message);
    } catch (error) {
      console.error(error);
      alert("Erro ao consultar a API do Flussonic.");
    } finally {
      setLoadingApiStreams(false);
    }
  };

  const handleGeneratePublicPlaylist = async () => {
    setLoadingApiStreams(true);
    try {
      const result = (await publicPlaylistFn({
        data: {
          serverIp,
          apiBaseUrl,
          apiUsername,
          apiPassword,
          apiStreamsPath,
          preferredPlaybackPath: "/index.m3u8",
        },
      })) as {
        success: boolean;
        message: string;
        endpoint: string;
        playlist: string;
        streams: string[];
      };

      if (!result.success) {
        alert(result.message);
        return;
      }

      setApiStreamsEndpoint(result.endpoint);
      setApiStreams(result.streams);
      setPublicPlaylist(result.playlist);
      setPublicPlaylistEndpoint(result.endpoint);
      alert(result.message);
    } catch (error) {
      console.error(error);
      alert("Erro ao gerar a playlist pública do Flussonic.");
    } finally {
      setLoadingApiStreams(false);
    }
  };

  const handleCopyPublicPlaylist = async () => {
    if (!publicPlaylist) return;
    await navigator.clipboard.writeText(publicPlaylist);
    setPlaylistCopied(true);
    setTimeout(() => setPlaylistCopied(false), 2000);
  };

  const handleDownloadPublicPlaylist = () => {
    if (!publicPlaylist) return;
    const blob = new Blob([publicPlaylist], { type: "audio/x-mpegurl" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "flussonic-public-playlist.m3u";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (localStorage.getItem("mago_flussonic_auto_connect") === "1" || connectionHealth !== null) {
      const poll = async () => {
        try {
          const result = (await refreshProfileFn({
            data: { panelUsername },
          })) as {
            success: boolean;
            message: string;
            profile: FlussonicConnectionProfile | null;
            health: FlussonicConnectionHealth | null;
            profiles: FlussonicConnectionProfile[];
          };

          if (!result.success || !result.profile || !result.health) return;

          applyProfileToForm(result.profile);
          setSavedProfiles(result.profiles ?? []);
          setSelectedProfileId(result.profile.profileId ?? null);
          setProfileName(result.profile.profileName || result.profile.serverIp);
          setSshStatus(result.health.sshOk ? "connected" : "disconnected");
        } catch (error) {
          console.error(error);
        }
      };

      void poll();
      const interval = window.setInterval(() => {
        void poll();
      }, 15000);

      return () => window.clearInterval(interval);
    }

    return undefined;
  }, [connectionHealth, panelUsername, refreshProfileFn]);

  const openDownloadDialog = (categoryName: string) => {
    const sourceItems = customCategories[categoryName] || [];
    const existingCategory = flussonicMirror?.categories?.[0]?.name || "";
    setDownloadSourceCategory(categoryName);
    setDownloadTargetMode(existingCategory ? "existing" : "new");
    setDownloadExistingCategory(existingCategory);
    setDownloadNewCategory(categoryName);
    const nextQueue = sourceItems.map((item) => item.id);
    setDownloadSelectedItemIds(nextQueue);
    setDownloadQueueOrder(nextQueue);
    setDownloadChannelName(categoryName);
    setDownloadDialogOpen(true);
  };

  const canManuallyPublishJob =
    Boolean(downloadJob) &&
    downloadJob.state !== "running" &&
    downloadJob.completedItems > 0 &&
    downloadJob.items.some((item) => item.status === "done");

  const handleManualPublishJob = async () => {
    if (!downloadJob?.jobId) return;
    setPublishingJobId(downloadJob.jobId);
    try {
      const result = (await publishJobFn({
        data: {
          jobId: downloadJob.jobId,
        },
      })) as {
        success: boolean;
        message: string;
        status: FlussonicDownloadJobStatus | null;
      };

      if (!result.success || !result.status) {
        alert(result.message);
        return;
      }

      setDownloadJob(result.status);
      void syncDownloadJobTrace(result.status.jobId);
      void syncMirrorAndStreams();
      alert(result.message);
    } catch (error) {
      console.error(error);
      alert(`Falha ao publicar o canal: ${error instanceof Error ? error.message : "erro inesperado"}`);
    } finally {
      setPublishingJobId(null);
    }
  };

  const toggleDownloadSelectedItem = useCallback((itemId: string) => {
    setDownloadSelectedItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
    );
    setDownloadQueueOrder((current) => {
      if (current.includes(itemId)) {
        return current.filter((id) => id !== itemId);
      }
      return [...current, itemId];
    });
  }, []);

  const selectAllDownloadItems = useCallback(() => {
    const sourceItems = customCategories[downloadSourceCategory] || [];
    const nextQueue = sourceItems.map((item) => item.id);
    setDownloadSelectedItemIds(nextQueue);
    setDownloadQueueOrder(nextQueue);
  }, [customCategories, downloadSourceCategory]);

  const clearDownloadItems = useCallback(() => {
    setDownloadSelectedItemIds([]);
    setDownloadQueueOrder([]);
  }, []);

  const moveDownloadQueueItem = useCallback((itemId: string, direction: -1 | 1) => {
    setDownloadQueueOrder((current) => {
      const index = current.indexOf(itemId);
      if (index < 0) return current;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;

      const next = [...current];
      const [removed] = next.splice(index, 1);
      next.splice(targetIndex, 0, removed);
      return next;
    });
  }, []);

  const downloadSourceItems = customCategories[downloadSourceCategory] || [];
  const downloadQueueItems = useMemo(() => {
    const itemsById = new Map(downloadSourceItems.map((item) => [item.id, item]));
    return downloadQueueOrder
      .map((itemId) => itemsById.get(itemId))
      .filter((item): item is M3UItem => Boolean(item));
  }, [downloadQueueOrder, downloadSourceItems]);

  const handleDownload = async () => {
    if (!downloadSourceCategory) return;
    if (sshStatus !== "connected") {
      alert("Conecte ao servidor via SSH primeiro!");
      return;
    }

    const sourceItems = customCategories[downloadSourceCategory] || [];
    const selectedMap = new Map(sourceItems.map((item) => [item.id, item]));
    const selectedSourceItems = downloadQueueOrder
      .map((itemId) => selectedMap.get(itemId))
      .filter((item): item is (typeof sourceItems)[number] => !!item);
    const targetCategoryName =
      downloadTargetMode === "existing" ? downloadExistingCategory.trim() : downloadNewCategory.trim();
    const targetChannelName = downloadChannelName.trim() || downloadSourceCategory.trim();

    if (selectedSourceItems.length === 0) {
      alert("Selecione pelo menos um filme para iniciar a fila.");
      return;
    }

    if (!targetCategoryName) {
      alert(
        downloadTargetMode === "existing"
          ? "Selecione uma categoria existente."
          : "Informe o nome da nova categoria.",
      );
      return;
    }

    setDownloadingCategory(downloadSourceCategory);
    setJobInProgress(true);
    try {
      const result = (await startJobFn({
        data: {
          panelUsername,
          serverIp,
          sshUser,
          sshPassword,
          sshPort: parseInt(sshPort),
          categoryName: targetCategoryName,
          channelName: targetChannelName,
          items: selectedSourceItems.map((item) => ({ name: item.name, url: item.url })),
          concurrency: 2,
        },
      })) as SshResponse;

      if (result.success) {
        const initialJob: FlussonicDownloadJobStatus = {
          jobId: result.jobId || "",
          state: "queued",
          categoryName: targetCategoryName,
          channelName: targetChannelName,
          streamName: result.streamName || targetChannelName,
          folder: result.folder || "",
          playlistPath: result.playlistPath || "",
          totalItems: selectedSourceItems.length,
          completedItems: 0,
          failedItems: 0,
          percent: 0,
          items: selectedSourceItems.map((item, index) => ({
            name: item.name,
            fileName: `${String(index + 1).padStart(3, "0")}-${item.name}`,
            url: item.url,
            status: "queued",
            downloadedBytes: 0,
            totalBytes: null,
          })),
        };
        setDownloadJob(initialJob);
        setDownloadJobEvents([]);
        setDownloadItemSearch("");
        cacheActiveDownloadJobId(result.jobId || null);
        void syncDownloadJobTrace(result.jobId || "");
        setDownloadDialogOpen(false);
        alert(
          `Canal 24h em loop iniciado para "${downloadSourceCategory}". O painel vai mostrar o progresso em tempo real.`,
        );
      } else {
        alert("Erro: " + result.message);
        setJobInProgress(false);
        cacheActiveDownloadJobId(null);
      }
    } catch (error) {
      alert("Erro ao enviar categoria.");
      setJobInProgress(false);
      cacheActiveDownloadJobId(null);
    } finally {
      setDownloadingCategory(null);
      setDownloadDialogOpen(false);
    }
  };

  useEffect(() => {
    if (!downloadJob?.jobId) {
      if (jobPollRef.current) {
        window.clearInterval(jobPollRef.current);
        jobPollRef.current = null;
      }
      return;
    }

    const poll = async () => {
      if (jobStatusPollInFlightRef.current) return;
      jobStatusPollInFlightRef.current = true;
      try {
        const result = (await withTimeout(
          readJobStatusFn({
            data: {
              serverIp,
              sshUser,
              sshPassword,
              sshPort: parseInt(sshPort),
              jobId: downloadJob.jobId,
            },
          }) as Promise<{ success: boolean; message: string; status: FlussonicDownloadJobStatus | null }>,
          10000,
          "Consulta do job",
        )) as { success: boolean; message: string; status: FlussonicDownloadJobStatus | null };

        if (!result.success || !result.status) return;

        setDownloadJob(result.status);
        void syncDownloadJobTrace(result.status.jobId);

        if (result.status.state === "completed" || result.status.state === "failed") {
          setJobInProgress(false);
          cacheActiveDownloadJobId(null);
          if (jobPollRef.current) {
            window.clearInterval(jobPollRef.current);
            jobPollRef.current = null;
          }
          await syncMirrorAndStreams();
          alert(
            result.status.state === "completed"
              ? `Download concluído para ${result.status.streamName}.`
              : `Download falhou: ${result.status.error || result.status.message || "erro desconhecido"}`,
          );
        }
      } catch (error) {
        console.error(error);
      } finally {
        jobStatusPollInFlightRef.current = false;
      }
    };

    void poll();
    jobPollRef.current = window.setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      if (jobPollRef.current) {
        window.clearInterval(jobPollRef.current);
        jobPollRef.current = null;
      }
    };
  }, [
    downloadJob?.jobId,
    readJobStatusFn,
    syncMirrorAndStreams,
    serverIp,
    sshPassword,
    sshPort,
    sshUser,
    cacheActiveDownloadJobId,
    syncDownloadJobTrace,
  ]);

  const hydrateSelectedProfile = (profile: FlussonicConnectionProfile) => {
    applyProfileToForm(profile);
    setSelectedProfileId(profile.profileId ?? null);
    setProfileName(profile.profileName || profile.serverIp);
    persistConnectionSnapshot({
      serverIp: profile.serverIp,
      sshUser: profile.sshUser,
      sshPort: profile.sshPort,
      sshPassword: profile.sshPassword,
      apiBaseUrl: profile.apiBaseUrl,
      apiUsername: profile.apiUsername,
      apiPassword: profile.apiPassword,
      apiStreamsPath: profile.apiStreamsPath,
      lastConnectedAt: profile.lastHealth?.lastCheckedAt || profile.updatedAt,
    });
  };

  const handleSelectProfile = async (profile: FlussonicConnectionProfile) => {
    setSelectedProfileId(profile.profileId ?? null);
    const result = (await activateProfileFn({
      data: {
        panelUsername,
        profileId: profile.profileId || "",
      },
    })) as {
      success: boolean;
      message: string;
      profile: FlussonicConnectionProfile | null;
      profiles: FlussonicConnectionProfile[];
    };

    if (!result.success || !result.profile) {
      alert(result.message);
      return;
    }

    setSavedProfiles(result.profiles ?? []);
    hydrateSelectedProfile(result.profile);
    setSshStatus(result.profile.lastHealth?.sshOk ? "connected" : "disconnected");
  };

  const handleStartNewServer = useCallback(() => {
    setSelectedProfileId(null);
    setProfileName("");
    setServerIp("173.208.244.141");
    setSshUser("root");
    setSshPort("22");
    setSshPassword("");
    setApiBaseUrl("http://173.208.244.141");
    setApiUsername("admin");
    setApiPassword("admin");
    setApiStreamsPath("/streamer/api/v3/streams");
    setConnectionHealth(null);
    setSshStatus("disconnected");
    setDownloadJob(null);
    setDownloadJobEvents([]);
    setDownloadItemSearch("");
    setJobInProgress(false);
    cacheActiveDownloadJobId(null);
    setApiStreams([]);
    setApiStreamsEndpoint("");
    setPublicPlaylist("");
    setPublicPlaylistEndpoint("");
  }, [cacheActiveDownloadJobId]);

  const handleDeleteProfile = async (profile: FlussonicConnectionProfile) => {
    if (!profile.profileId) return;
    const confirmed = window.confirm(
      `Remover o servidor "${profile.profileName || profile.serverIp}"?`,
    );
    if (!confirmed) return;

    const result = (await deleteProfileFn({
      data: {
        panelUsername,
        profileId: profile.profileId,
      },
    })) as { success: boolean; message: string };

    if (!result.success) {
      alert(result.message);
      return;
    }

    const refresh = (await loadProfileFn({
      data: { panelUsername },
    })) as {
      success: boolean;
      message: string;
      profile: FlussonicConnectionProfile | null;
      profiles: FlussonicConnectionProfile[];
    };

    setSavedProfiles(refresh.profiles ?? []);
    if (refresh.profile) {
      hydrateSelectedProfile(refresh.profile);
      setSshStatus(refresh.profile.lastHealth?.sshOk ? "connected" : "disconnected");
    } else {
      handleStartNewServer();
    }
  };

  const handleDeleteChannel = async (
    categoryName: string,
    channel: { name: string; folderPath?: string; playlistPath?: string; streamName: string },
  ) => {
    if (!channel.folderPath) {
      alert("Não foi possível localizar a pasta do canal para exclusão.");
      return;
    }

    const confirmed = window.confirm(
      `Tem certeza que deseja excluir o canal "${channel.name}" da categoria "${categoryName}"? Essa ação apaga a pasta e remove o bloco do Flussonic.`,
    );
    if (!confirmed) return;

    const key = `channel:${channel.folderPath}`;
    setDeletingKey(key);
    try {
      const result = (await deleteChannelFn({
        data: {
          serverIp,
          sshUser,
          sshPassword,
          sshPort: parseInt(sshPort),
          flussonicConfPath: "/etc/flussonic/flussonic.conf",
          apiBaseUrl,
          apiUsername,
          apiPassword,
          apiStreamsPath,
          channelPath: channel.folderPath,
          playlistPath: channel.playlistPath || "",
          streamName: channel.streamName,
        },
      })) as SshResponse;

      if (!result.success) {
        alert(
          `Falha ao excluir canal: ${result.message}${result.output ? `\n${result.output}` : ""}`,
        );
        return;
      }

      await refreshMirrorAfterMutation("excluir canal");
      alert(result.message);
    } catch (error) {
      console.error(error);
      alert(
        `Erro ao excluir canal: ${error instanceof Error ? error.message : "falha inesperada"}`,
      );
    } finally {
      setDeletingKey(null);
    }
  };

  const handleDeleteCategory = async (category: { name: string; path: string }) => {
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir a categoria "${category.name}"? Isso remove a pasta inteira e todos os canais ligados a ela.`,
    );
    if (!confirmed) return;

    const key = `category:${category.path}`;
    setDeletingKey(key);
    try {
      const result = (await deleteCategoryFn({
        data: {
          serverIp,
          sshUser,
          sshPassword,
          sshPort: parseInt(sshPort),
          flussonicConfPath: "/etc/flussonic/flussonic.conf",
          apiBaseUrl,
          apiUsername,
          apiPassword,
          apiStreamsPath,
          categoryPath: category.path,
        },
      })) as SshResponse;

      if (!result.success) {
        await reconcileMirrorAfterFailedMutation("excluir categoria");
        alert(
          `Falha ao excluir categoria: ${result.message}${result.output ? `\n${result.output}` : ""}`,
        );
        return;
      }

      await refreshMirrorAfterMutation("excluir categoria");
      alert(result.message);
    } catch (error) {
      console.error(error);
      await reconcileMirrorAfterFailedMutation("excluir categoria");
      alert(
        `Erro ao excluir categoria: ${error instanceof Error ? error.message : "falha inesperada"}`,
      );
    } finally {
      setDeletingKey(null);
    }
  };

  const getStreamRuntimeState = (stream: FlussonicStreamInfo) => {
    const status = (stream.status || "").toLowerCase();
    if (status.includes("run")) return { label: "ONLINE", tone: "bg-green-500/15 text-green-400 border-green-500/20" };
    if (status.includes("wait")) return { label: "WAITING", tone: "bg-amber-500/15 text-amber-400 border-amber-500/20" };
    if (status.includes("stop") || status.includes("fail") || status.includes("err")) {
      return { label: "OFFLINE", tone: "bg-red-500/15 text-red-400 border-red-500/20" };
    }
    if (stream.running) return { label: "ONLINE", tone: "bg-green-500/15 text-green-400 border-green-500/20" };
    return { label: "UNKNOWN", tone: "bg-white/10 text-neutral-300 border-white/10" };
  };

  const formatBitrate = (value?: number) => {
    if (!value || !Number.isFinite(value)) return "0 kbps";
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)} Mbps`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)} kbps`;
    return `${value} bps`;
  };

  const downloadStream = downloadJob
    ? flussonicStreams.find((stream) => stream.name === downloadJob.streamName)
    : null;
  const downloadStreamIsOnline =
    Boolean(downloadStream?.running) ||
    Boolean((downloadStream?.status || "").toLowerCase().includes("run"));
  const downloadFlowState =
    publishingJobId === downloadJob?.jobId || downloadJob?.state === "running"
      ? "publicando"
      : downloadStreamIsOnline
        ? "online"
        : downloadJob?.completedItems && downloadJob.completedItems > 0
          ? "pronto"
          : "publicando";
  const downloadFlowHint =
    downloadFlowState === "publicando"
      ? "Os arquivos estão sendo processados e a playlist está em construção."
      : downloadFlowState === "pronto"
        ? "Os arquivos já estão prontos; se necessário, use a subida segura."
        : "O stream já está online no Flussonic.";
  const downloadFlowChips = [
    {
      key: "publicando",
      label: "publicando",
      active: downloadFlowState === "publicando",
      tone: "border-blue-500/25 bg-blue-500/15 text-blue-300",
      idle: "border-white/10 bg-black/20 text-neutral-400",
    },
    {
      key: "pronto",
      label: "pronto",
      active: downloadFlowState === "pronto",
      tone: "border-amber-500/25 bg-amber-500/15 text-amber-300",
      idle: "border-white/10 bg-black/20 text-neutral-400",
    },
    {
      key: "online",
      label: "online",
      active: downloadFlowState === "online",
      tone: "border-green-500/25 bg-green-500/15 text-green-300",
      idle: "border-white/10 bg-black/20 text-neutral-400",
    },
  ] as const;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="bg-[#141414] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-500">
              <Server size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Conexão e Gestão do Flussonic</h2>
              <p className="text-sm text-neutral-400">
                Conecte ao host real, consulte a API e gerencie canais e categorias do servidor
              </p>
            </div>
          </div>
          {sshStatus === "connected" && (
            <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-500 border border-green-500/20 rounded-full text-xs font-bold uppercase tracking-wider">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Conectado
            </div>
          )}
        </div>

        <div className="bg-blue-600/10 border border-blue-600/20 rounded-xl p-5 mb-8">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-blue-600 rounded-lg text-white mt-1 shrink-0">
              <Terminal size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-blue-400 mb-1">Preparar storage remoto do Flussonic</h3>
              <p className="text-sm text-neutral-300 mb-4">
                Este comando garante a pasta de trabalho remota e a base de storage usada pela
                API e pelo SSH:
              </p>
              <div className="relative group">
                <div className="bg-black/60 rounded-lg p-4 font-mono text-[10px] sm:text-xs text-blue-300 break-all pr-12 border border-white/5 overflow-x-auto">
                  {`mkdir -p /opt/flussonic/priv && grep -q '^vod vod {' /etc/flussonic/flussonic.conf || cat << 'EOF' >> /etc/flussonic/flussonic.conf

vod vod {
  storage /opt/flussonic/priv;
}

EOF
service flussonic reload`}
                </div>
                <button
                  onClick={() => {
                    const cmd = `mkdir -p /opt/flussonic/priv && grep -q '^vod vod {' /etc/flussonic/flussonic.conf || cat << 'EOF' >> /etc/flussonic/flussonic.conf

vod vod {
  storage /opt/flussonic/priv;
}

EOF
service flussonic reload`;
                    navigator.clipboard.writeText(cmd);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-md transition-colors text-neutral-400 hover:text-white"
                  title="Copiar comando"
                >
                  {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                </button>
              </div>
              <p className="text-[10px] text-neutral-500 mt-3 italic">
                * Depois disso, o painel grava a playlist, registra o stream na API e atualiza o
                espelho do servidor automaticamente.
              </p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="font-bold text-neutral-400 text-xs uppercase tracking-widest flex items-center gap-2 mb-4">
              <Shield size={14} /> Conexão autenticada
            </h3>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-widest text-neutral-500">
                    Conexões salvas
                  </div>
                  <div className="text-sm text-neutral-300">
                    {savedProfiles.length > 0
                      ? `${savedProfiles.length} conexão${savedProfiles.length === 1 ? "" : "ões"} disponível(is)`
                      : "Nenhuma conexão salva ainda"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void loadFlussonicMirror()}
                    disabled={loadingMirror || sshStatus !== "connected"}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={14} />
                    Revalidar
                  </button>
                  <button
                    onClick={handleStartNewServer}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold transition-colors"
                  >
                    <Server size={14} />
                    Nova conexão
                  </button>
                </div>
              </div>

              {savedProfiles.length === 0 ? (
                <div className="text-sm text-neutral-500 border border-dashed border-white/10 rounded-xl p-4">
                  Salve a primeira conexão para poder alternar entre múltiplos Flussonics neste
                  usuário.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {savedProfiles.map((profile) => (
                    <div
                      key={profile.profileId}
                      role="button"
                      tabIndex={0}
                      onClick={() => void handleSelectProfile(profile)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void handleSelectProfile(profile);
                        }
                      }}
                      className={`cursor-pointer text-left rounded-xl border p-4 transition-all ${
                        selectedProfileId === profile.profileId
                          ? "border-blue-500/50 bg-blue-600/10"
                          : "border-white/10 bg-[#0f0f0f] hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold truncate">
                            {profile.profileName || profile.serverIp}
                          </div>
                          <div className="text-xs text-neutral-500 mt-1 break-all">
                            {profile.serverIp}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {selectedProfileId === profile.profileId && (
                            <span className="text-[10px] uppercase tracking-widest text-blue-400">
                              Ativo
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteProfile(profile);
                            }}
                            className="p-1.5 rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Remover conexão"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-neutral-500">
                        <div>
                          SSH: {profile.sshUser}@{profile.sshPort}
                        </div>
                        <div>API: {profile.apiUsername}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="sm:col-span-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                  Nome da conexão
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                  placeholder="Ex: Flussonic principal"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                  Usuário
                </label>
                <input
                  type="text"
                  value={sshUser}
                  onChange={(e) => setSshUser(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                  placeholder="root"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                  Host / IP
                </label>
                <input
                  type="text"
                  value={serverIp}
                  onChange={(e) => setServerIp(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                  placeholder="173.208.244.141"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-4 gap-4">
              <div className="sm:col-span-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                  Senha SSH ou chave
                </label>
                <input
                  type="password"
                  value={sshPassword}
                  onChange={(e) => setSshPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                  placeholder="Deixe em branco se a chave SSH já estiver autorizada"
                />
                <p className="text-[10px] text-neutral-500 mt-2">
                  O painel usa a chave SSH quando disponível e cai para senha apenas se
                  necessário.
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                  Porta
                </label>
                <input
                  type="text"
                  value={sshPort}
                  onChange={(e) => setSshPort(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                  placeholder="22"
                />
              </div>
            </div>

            <button
              onClick={() => void handleConnect()}
              disabled={sshStatus === "connecting" || sshStatus === "connected"}
              className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all mt-2 ${
                sshStatus === "connected"
                  ? "bg-green-600/20 text-green-500 border border-green-600/30 cursor-default"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20"
              }`}
            >
              {sshStatus === "connecting" ? (
                <Loader2 className="animate-spin" size={20} />
              ) : sshStatus === "connected" ? (
                <>
                  <CheckCircle2 size={20} />
                  Conexão salva e autorizada
                </>
              ) : (
                <>
                  <Shield size={20} />
                  Validar acesso e salvar conexão
                </>
              )}
            </button>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm uppercase tracking-widest text-neutral-400">
                    API Flussonic
                  </h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    Use a API para consultar streams e gerar playlists públicas sem depender do
                    acesso SSH.
                  </p>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">
                  Leitura + exportação
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                    URL base da API
                  </label>
                  <input
                    type="text"
                    value={apiBaseUrl}
                    onChange={(e) => setApiBaseUrl(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors text-sm"
                    placeholder="http://173.208.244.141"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                    Usuário API
                  </label>
                  <input
                    type="text"
                    value={apiUsername}
                    onChange={(e) => setApiUsername(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors text-sm"
                    placeholder="admin"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                    Senha API
                  </label>
                  <input
                    type="password"
                    value={apiPassword}
                    onChange={(e) => setApiPassword(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors text-sm"
                    placeholder="admin"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                    Endpoint de streams
                  </label>
                  <input
                    type="text"
                    value={apiStreamsPath}
                    onChange={(e) => setApiStreamsPath(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors text-sm"
                    placeholder="/streamer/api/v3/streams"
                  />
                  <p className="text-[10px] text-neutral-500 mt-2">
                    Se o endpoint principal variar, o painel tenta automaticamente caminhos
                    compatíveis do Flussonic.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleLoadApiStreams()}
                  disabled={loadingApiStreams}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold transition-all"
                >
                  {loadingApiStreams ? <Loader2 className="animate-spin" size={16} /> : <List size={16} />}
                  Consultar streams da API
                </button>
                <button
                  type="button"
                  onClick={() => void handleGeneratePublicPlaylist()}
                  disabled={loadingApiStreams}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold transition-all"
                >
                  {loadingApiStreams ? <Loader2 className="animate-spin" size={16} /> : <FileVideo size={16} />}
                  Gerar M3U público
                </button>
              </div>

              {apiStreamsEndpoint && (
                <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-xs text-neutral-300">
                  <div className="uppercase tracking-widest text-neutral-500 mb-1">Endpoint usado</div>
                  <div className="break-all font-mono">{apiStreamsEndpoint}</div>
                </div>
              )}
              {publicPlaylistEndpoint && (
                <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-xs text-neutral-300">
                  <div className="uppercase tracking-widest text-neutral-500 mb-1">
                    Playlist público gerado a partir de
                  </div>
                  <div className="break-all font-mono">{publicPlaylistEndpoint}</div>
                </div>
              )}
              {publicPlaylist && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyPublicPlaylist()}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-white hover:bg-white/10 transition-colors"
                    >
                      {playlistCopied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                      Copiar M3U
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadPublicPlaylist}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-white hover:bg-white/10 transition-colors"
                    >
                      <Download size={14} />
                      Baixar M3U
                    </button>
                  </div>
                  <pre className="max-h-56 overflow-auto rounded-xl border border-white/10 bg-black/50 p-4 text-[11px] leading-5 text-neutral-300 whitespace-pre-wrap">
                    {publicPlaylist}
                  </pre>
                </div>
              )}
              {apiStreams.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="text-xs uppercase tracking-widest text-neutral-500">
                      Streams retornados pela API
                    </div>
                    <div className="text-xs text-neutral-400">{apiStreams.length} itens</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {apiStreams.slice(0, 16).map((stream) => (
                      <span
                        key={stream}
                        className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-neutral-300"
                      >
                        {stream}
                      </span>
                    ))}
                    {apiStreams.length > 16 && (
                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-neutral-400">
                        +{apiStreams.length - 16} mais
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-black/20 rounded-2xl p-6 border border-white/5 flex flex-col items-center justify-center text-center space-y-4">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center ${sshStatus === "connected" ? "bg-green-500/10 text-green-500" : "bg-neutral-800 text-neutral-500"}`}
            >
              <Shield size={32} />
            </div>
            <div>
              <p className="font-bold text-sm mb-1">Conexão Segura</p>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Suas credenciais são usadas apenas para estabelecer a conexão SSH. O sistema envia
                os arquivos, monta a playlist e recarrega o Flussonic no servidor remoto.
              </p>
            </div>
            <div className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-left text-xs text-neutral-300">
              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-500 uppercase tracking-widest text-[10px]">
                  Estado salvo
                </span>
                <span
                  className={
                    connectionHealth?.state === "connected"
                      ? "text-green-400"
                      : connectionHealth?.state === "degraded"
                        ? "text-amber-400"
                        : "text-neutral-500"
                  }
                >
                  {connectionHealth?.state === "connected"
                    ? "SSH + API conectados"
                    : connectionHealth?.state === "degraded"
                      ? "Conexão parcial"
                    : "Aguardando conexão"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span>SSH</span>
                <span className={connectionHealth?.sshOk ? "text-green-400" : "text-red-400"}>
                  {connectionHealth?.sshOk ? "OK" : "OFF"}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span>API Flussonic</span>
                <span className={connectionHealth?.apiOk ? "text-green-400" : "text-red-400"}>
                  {connectionHealth?.apiOk ? "OK" : "OFF"}
                </span>
              </div>
              {connectionHealth?.lastCheckedAt && (
                <div className="mt-2 text-neutral-500">
                  Última checagem:{" "}
                  {new Date(connectionHealth.lastCheckedAt).toLocaleString("pt-BR")}
                </div>
              )}
            </div>
            {sshStatus !== "connected" && (
              <div className="text-[10px] text-neutral-600 bg-neutral-900 px-3 py-1 rounded-full uppercase tracking-widest font-bold">
                Aguardando Validação
              </div>
            )}
            <button
              onClick={() => void loadFlussonicMirror()}
              disabled={loadingMirror || sshStatus !== "connected"}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold transition-all"
            >
              {loadingMirror ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <RefreshCw size={16} />
              )}
              Sincronizar árvore
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/5 bg-black/20 p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-bold text-sm uppercase tracking-widest text-neutral-400">
                Canais já no Flussonic
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                Lidos da API do Flussonic e do storage remoto.
              </p>
            </div>
            <span className="text-xs text-neutral-400">{flussonicStreams.length} canais</span>
          </div>
          {flussonicStreams.length === 0 ? (
            <div className="text-sm text-neutral-500 border border-dashed border-white/10 rounded-xl p-4">
              Conecte e sincronize a árvore para carregar os canais e categorias existentes.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {flussonicStreams.map((stream) => (
                <div
                  key={stream.name}
                  className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-bold">{stream.name}</div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-bold tracking-widest ${getStreamRuntimeState(stream).tone}`}
                    >
                      {getStreamRuntimeState(stream).label}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-1 break-all">
                    {stream.playlistPath
                      ? `playlist:///${stream.playlistPath}`
                      : "Stream registrado no Flussonic"}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-400">
                    <span className="rounded-full border border-white/10 px-2 py-1">
                      {stream.clientCount ?? 0} cliente(s)
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-1">
                      IN {formatBitrate(stream.inputBitrate)}
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-1">
                      OUT {formatBitrate(stream.outputBitrate)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-white/5 bg-black/20 p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-bold text-sm uppercase tracking-widest text-neutral-400">
                Árvore do Flussonic
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                Categorias, canais, playlists e arquivos locais do servidor remoto.
              </p>
            </div>
            <button
              onClick={() => void loadFlussonicMirror()}
              disabled={loadingMirror || sshStatus !== "connected"}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold transition-all"
            >
              {loadingMirror ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <RefreshCw size={16} />
              )}
              Atualizar árvore
            </button>
          </div>

          {!flussonicMirror ? (
            <div className="text-sm text-neutral-500 border border-dashed border-white/10 rounded-xl p-4">
              Conecte e sincronize para ver a árvore real do Flussonic.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
                  <div className="text-xs uppercase tracking-widest text-neutral-500">
                    Storage Root
                  </div>
                  <div className="font-mono text-sm mt-2 break-all">
                    {flussonicMirror.storageRoot}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Config</div>
                  <div className="font-mono text-sm mt-2 break-all">{flussonicMirror.confPath}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
                  <div className="text-xs uppercase tracking-widest text-neutral-500">Streams</div>
                  <div className="text-2xl font-bold mt-2">{flussonicMirror.streams.length}</div>
                </div>
              </div>

              {flussonicMirror.categories.length === 0 ? (
                <div className="text-sm text-neutral-500 border border-dashed border-white/10 rounded-xl p-4">
                  Nenhuma categoria encontrada na pasta de mídia local.
                </div>
              ) : (
                <div className="grid gap-3">
                  {flussonicMirror.categories.map((category) => (
                    <div
                      key={category.path}
                      className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 font-bold">
                            <FolderOpen size={16} className="text-blue-400" />
                            {category.name}
                          </div>
                          <div className="text-xs text-neutral-500 mt-1 break-all">
                            {category.path}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="text-right text-xs text-neutral-400">
                            <div>{category.channels.length} canais</div>
                            <div>{category.fileCount} arquivos</div>
                          </div>
                          <button
                            onClick={() => void handleDeleteCategory(category)}
                            disabled={deletingKey === `category:${category.path}`}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold transition-all"
                          >
                            {deletingKey === `category:${category.path}` ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                            Excluir categoria
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {category.channels.map((channel) => (
                          <div
                            key={channel.folderPath || channel.name}
                            className="rounded-lg border border-white/10 bg-black/30 p-3"
                          >
                            <div className="flex items-center gap-2 font-medium">
                              <Tv2 size={14} className="text-purple-400" />
                              {channel.name}
                            </div>
                            <div className="text-xs text-neutral-500 mt-1 break-all">
                              {channel.playlistPath || "playlist ausente"}
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-xs text-neutral-400">
                                <FileVideo size={12} />
                                {channel.mediaCount} mídias locais
                              </div>
                              <button
                                onClick={() => handleDeleteChannel(category.name, channel)}
                                disabled={
                                  deletingKey === `channel:${channel.folderPath || channel.name}`
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-[11px] font-bold transition-all"
                              >
                                {deletingKey === `channel:${channel.folderPath || channel.name}` ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Trash2 size={12} />
                                )}
                                Excluir
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#141414] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-purple-600/20 flex items-center justify-center text-purple-500">
            <Download size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Criar canais automáticos</h2>
            <p className="text-sm text-neutral-400">
              Baixe a categoria em fila paralela de 2 arquivos e recarregue o Flussonic em um passo
            </p>
          </div>
        </div>

        {downloadJob && (
          <div className="mb-5 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold flex items-center gap-2">
                  <CircleDashed
                    size={16}
                    className={
                      downloadJob.state === "running"
                        ? "animate-spin text-blue-400"
                        : "text-blue-400"
                    }
                  />
                  {downloadJob.categoryName}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {downloadFlowChips.map((chip) => (
                    <span
                      key={chip.key}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                        chip.active ? chip.tone : chip.idle
                      }`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-neutral-300 mt-2">
                  {downloadJob.state === "completed"
                    ? "Concluído"
                    : downloadJob.state === "failed"
                      ? "Concluído com aviso ou aguardando a subida segura"
                      : `Baixando ${downloadJob.completedItems}/${downloadJob.totalItems} arquivos`}
                </div>
                <div className="mt-1 text-[11px] text-neutral-400">
                  {downloadFlowHint}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold">{Math.round(downloadJob.percent)}%</div>
                <div className="text-[10px] text-neutral-400 uppercase tracking-widest">
                  {downloadJob.state}
                </div>
              </div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-black/40 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, downloadJob.percent))}%` }}
              />
            </div>
            <div className="mt-3 text-xs text-neutral-300">
              {downloadJob.currentFile ? (
                <div>
                  Arquivo atual: <span className="font-mono">{downloadJob.currentFile}</span>
                </div>
              ) : null}
              <div className="mt-1">
                Job ID: <span className="font-mono">{downloadJob.jobId}</span>
              </div>
              <div className="mt-1">
                Fila paralela: 2 downloads simultâneos no servidor 173.208.244.141
              </div>
            </div>
            <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500">
                    Conteúdo em tempo real
                  </div>
                  <div className="text-xs text-neutral-400">
                    {filteredDownloadItems.length} de {downloadJob.items.length} itens visíveis
                  </div>
                </div>
                <div className="w-full sm:w-80">
                  <Input
                    value={downloadItemSearch}
                    onChange={(event) => setDownloadItemSearch(event.target.value)}
                    placeholder="Pesquisar por nome, arquivo ou URL"
                    className="h-9 border-white/10 bg-black/30 text-white placeholder:text-neutral-500"
                  />
                </div>
              </div>

              <ScrollArea className="h-[min(52vh,24rem)] pr-2">
                <div className="grid gap-2">
                  {filteredDownloadItems.length > 0 ? (
                    filteredDownloadItems.map((item) => {
                      const percent = item.totalBytes
                        ? Math.max(0, Math.min(100, Math.round((item.downloadedBytes / item.totalBytes) * 100)))
                        : item.status === "done"
                          ? 100
                          : 0;
                      return (
                        <div
                          key={item.fileName}
                          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate text-white">{item.name}</div>
                              <div className="text-neutral-500 font-mono truncate">{item.fileName}</div>
                              <div className="mt-2 h-1.5 rounded-full bg-black/50 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    item.status === "error"
                                      ? "bg-red-500"
                                      : item.status === "done"
                                        ? "bg-green-500"
                                        : "bg-blue-500"
                                  }`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div
                                className={
                                  item.status === "done"
                                    ? "text-green-400"
                                    : item.status === "error"
                                      ? "text-red-400"
                                      : "text-blue-300"
                                }
                              >
                                {item.status}
                              </div>
                              <div className="text-neutral-500">
                                {item.totalBytes
                                  ? `${percent}%`
                                  : item.downloadedBytes > 0
                                    ? `${Math.round(item.downloadedBytes / 1024 / 1024)} MB`
                                    : "aguardando"}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-3 py-4 text-center text-xs text-neutral-500">
                      Nenhum item corresponde à busca.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">
                  Linha do tempo
                </div>
                <div className="text-[10px] text-neutral-400">
                  {downloadJobEvents.length} evento(s) gravado(s)
                </div>
              </div>
              <ScrollArea className="mt-3 h-44 pr-2">
                <div className="space-y-2">
                  {downloadJobEvents.slice(-6).map((event) => (
                    <div
                      key={event.eventId}
                      className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className={
                            event.level === "success"
                              ? "text-green-400"
                              : event.level === "warning"
                                ? "text-amber-400"
                                : event.level === "error"
                                  ? "text-red-400"
                                  : "text-blue-300"
                          }
                        >
                          {event.eventType}
                        </span>
                        <span className="text-neutral-500">
                          {new Date(event.createdAt).toLocaleTimeString("pt-BR")}
                        </span>
                      </div>
                      <div className="mt-1 text-neutral-200">{event.message}</div>
                    </div>
                  ))}
                  {downloadJobEvents.length === 0 ? (
                    <div className="text-xs text-neutral-500">Nenhum evento registrado ainda.</div>
                  ) : null}
                </div>
              </ScrollArea>
            </div>

            {downloadJob ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-emerald-300">
                    Subida segura do canal
                  </div>
                  <div className="mt-1 text-xs text-emerald-100/80">
                    Use este botão se a publicação automática não subir. Ele reaproveita os arquivos
                    já baixados e só republica a playlist e o stream.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleManualPublishJob()}
                  disabled={!canManuallyPublishJob || publishingJobId === downloadJob.jobId}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {publishingJobId === downloadJob.jobId ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Subir canal com segurança
                </button>
              </div>
            ) : null}
          </div>
        )}

        {Object.keys(customCategories).length === 0 ? (
          <div className="py-12 text-center text-neutral-500 border border-dashed border-white/10 rounded-xl">
            <p>Você ainda não criou nenhuma categoria personalizada.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {Object.entries(customCategories).map(([name, items]) => (
              <div
                key={name}
                className="flex items-center justify-between p-4 bg-black/30 border border-white/5 rounded-xl hover:border-white/20 transition-all"
              >
                <div>
                  <h3 className="font-bold">{name}</h3>
                  <p className="text-xs text-neutral-500">{items.length} itens selecionados</p>
                </div>
                <button
                  onClick={() => openDownloadDialog(name)}
                  disabled={
                    sshStatus !== "connected" || downloadingCategory === name || jobInProgress
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-neutral-800 disabled:text-neutral-500 rounded-lg text-sm font-bold transition-all"
                >
                  {downloadingCategory === name || jobInProgress ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Repeat2 size={16} />
                  )}
                  Canal 24h em loop
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
      <DialogContent className="max-w-[min(980px,calc(100vw-1rem))] max-h-[88vh] overflow-hidden bg-[#111111] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">Escolher destino do canal</DialogTitle>
            <DialogDescription className="text-neutral-300">
              Selecione os filmes que vão entrar na fila e escolha se o canal vai para uma categoria já
              existente do Flussonic ou para uma nova categoria.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-col gap-4">
            <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-widest text-neutral-400">
                    Categoria de origem
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {downloadSourceCategory || "-"}
                  </div>
                  <div className="mt-1 text-xs text-neutral-300">
                    {customCategories[downloadSourceCategory]?.length || 0} item(ns) disponíveis. A fila baixa
                    em lotes de 3 no host remoto, sem depender do tamanho total da lista.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllDownloadItems}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/10 transition-colors"
                  >
                    Selecionar todos
                  </button>
                  <button
                    type="button"
                    onClick={clearDownloadItems}
                    className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs font-semibold text-neutral-400 hover:bg-white/5 transition-colors"
                  >
                    Limpar
                  </button>
                </div>
              </div>
            </div>

            <ScrollArea className="min-h-0 max-h-[calc(88vh-280px)] pr-3">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-white">Itens disponíveis</Label>
                    <div className="text-xs text-neutral-400">
                      {downloadQueueOrder.length} na fila
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20">
                    <div className="max-h-[calc(88vh-300px)] space-y-2 overflow-y-auto p-3">
                      {downloadSourceItems.map((item, index) => {
                        const checked = downloadSelectedItemIds.includes(item.id);
                        return (
                          <label
                            key={item.id}
                            className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/30 p-2.5 transition-colors hover:border-white/20"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleDownloadSelectedItem(item.id)}
                              className="mt-1 border-white/25 data-[state=checked]:border-purple-500 data-[state=checked]:bg-purple-600"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold leading-snug text-white">
                                {String(index + 1).padStart(2, "0")}. {item.name}
                              </div>
                              <div className="mt-1 break-all text-[11px] leading-snug text-neutral-400">
                                {item.url}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-400">
                    Marque os itens desejados. Os downloads vão respeitar exatamente a ordem definida na
                    fila ao lado.
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-white/10 bg-black/25 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-white">Fila manual</Label>
                    <div className="text-xs text-neutral-400">
                      {downloadQueueItems.length} item(ns)
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20">
                    <div className="max-h-[320px] space-y-2 overflow-y-auto p-3">
                      {downloadQueueItems.length > 0 ? (
                        downloadQueueItems.map((item, index) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 p-2.5"
                          >
                            <div className="w-8 text-center text-xs font-bold text-neutral-400">
                              {String(index + 1).padStart(2, "0")}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-white">{item.name}</div>
                              <div className="truncate text-[11px] text-neutral-500">{item.url}</div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => moveDownloadQueueItem(item.id, -1)}
                                disabled={index === 0}
                                className="rounded-md border border-white/10 bg-white/5 p-1.5 text-neutral-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                title="Mover para cima"
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveDownloadQueueItem(item.id, 1)}
                                disabled={index === downloadQueueItems.length - 1}
                                className="rounded-md border border-white/10 bg-white/5 p-1.5 text-neutral-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                title="Mover para baixo"
                              >
                                <ArrowDown size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleDownloadSelectedItem(item.id)}
                                className="rounded-md border border-red-500/20 bg-red-500/10 p-1.5 text-red-300 hover:bg-red-500/20"
                                title="Remover da fila"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-3 py-5 text-center text-xs text-neutral-500">
                          Selecione os vídeos para montar a fila manualmente.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-3">
                    <RadioGroup
                      value={downloadTargetMode}
                      onValueChange={(value) =>
                        setDownloadTargetMode(value === "new" ? "new" : "existing")
                      }
                      className="grid gap-3"
                    >
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/30 p-3.5 transition-colors hover:border-white/20">
                        <RadioGroupItem
                          value="existing"
                          className="mt-1"
                          disabled={!flussonicMirror?.categories.length}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-white">
                            Adicionar a uma categoria existente
                          </div>
                          <div className="text-xs text-neutral-400 mt-1">
                            Reaproveita uma categoria já criada no servidor para receber este canal como uma
                            nova pasta interna.
                          </div>
                        </div>
                      </label>

                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/30 p-3.5 transition-colors hover:border-white/20">
                        <RadioGroupItem value="new" className="mt-1" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-white">Criar nova categoria</div>
                          <div className="text-xs text-neutral-400 mt-1">
                            Cria uma nova pasta de categoria no Flussonic e salva o canal dentro dela.
                          </div>
                        </div>
                      </label>
                    </RadioGroup>

                    {downloadTargetMode === "existing" ? (
                      <div className="space-y-2">
                        <Label htmlFor="existing-category">Categoria existente</Label>
                        <Select value={downloadExistingCategory} onValueChange={setDownloadExistingCategory}>
                          <SelectTrigger
                            id="existing-category"
                            className="bg-black/30 border-white/10 text-white"
                          >
                            <SelectValue placeholder="Selecione uma categoria do Flussonic" />
                          </SelectTrigger>
                          <SelectContent>
                            {(flussonicMirror?.categories || []).map((category) => (
                              <SelectItem key={category.path} value={category.name}>
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!flussonicMirror?.categories.length ? (
                          <div className="text-xs text-amber-400">
                            Nenhuma categoria existente foi encontrada. Escolha a opção de nova categoria.
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="new-category">Nome da nova categoria</Label>
                        <Input
                          id="new-category"
                          value={downloadNewCategory}
                          onChange={(event) => setDownloadNewCategory(event.target.value)}
                          placeholder="Ex: filmes-premium"
                          className="bg-black/30 border-white/10 text-white placeholder:text-neutral-500"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="channel-name">Nome do canal</Label>
                      <Input
                        id="channel-name"
                        value={downloadChannelName}
                        onChange={(event) => setDownloadChannelName(event.target.value)}
                        placeholder="Nome do canal no Flussonic"
                        className="bg-black/30 border-white/10 text-white placeholder:text-neutral-500"
                      />
                      <div className="text-xs text-neutral-400">
                        Esse nome vira a pasta do canal e o stream registrado no Flussonic.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDownloadDialogOpen(false)}
              className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-neutral-300 hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={jobInProgress || downloadingCategory === downloadSourceCategory}
              className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {jobInProgress && downloadingCategory === downloadSourceCategory ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Canal 24h em loop
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
