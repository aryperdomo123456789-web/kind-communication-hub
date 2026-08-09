import { useCallback, useEffect, useRef, useState } from "react";
import {
  Server,
  Shield,
  Download,
  CheckCircle2,
  Loader2,
  Send,
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
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  activateSavedFlussonicProfile,
  deleteFlussonicCategory,
  deleteFlussonicChannel,
  deleteSavedFlussonicProfile,
  fetchFlussonicMirror,
  fetchFlussonicStreams,
  generateFlussonicPublicPlaylist,
  loadFlussonicConnectionProfile,
  refreshFlussonicConnectionProfile,
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
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [loadingMirror, setLoadingMirror] = useState(false);
  const [loadingApiStreams, setLoadingApiStreams] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playlistCopied, setPlaylistCopied] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [downloadJob, setDownloadJob] = useState<FlussonicDownloadJobStatus | null>(null);
  const [jobInProgress, setJobInProgress] = useState(false);
  const [apiStreamsEndpoint, setApiStreamsEndpoint] = useState("");
  const [apiStreams, setApiStreams] = useState<string[]>([]);
  const [publicPlaylist, setPublicPlaylist] = useState("");
  const [publicPlaylistEndpoint, setPublicPlaylistEndpoint] = useState("");
  const jobPollRef = useRef<number | null>(null);
  const syncFn = useServerFn(fetchFlussonicStreams);
  const mirrorFn = useServerFn(fetchFlussonicMirror);
  const deleteChannelFn = useServerFn(deleteFlussonicChannel);
  const deleteCategoryFn = useServerFn(deleteFlussonicCategory);
  const startJobFn = useServerFn(startFlussonicDownloadJob);
  const readJobStatusFn = useServerFn(fetchFlussonicDownloadJobStatus);
  const apiStreamsFn = useServerFn(fetchFlussonicApiStreams);
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
        const result = (await syncFn({
          data: {
            serverIp: nextServerIp,
            sshUser: nextSshUser,
            sshPassword: nextSshPassword,
            sshPort: nextSshPort,
            flussonicConfPath: "/etc/flussonic/flussonic.conf",
          },
        })) as { success: boolean; message: string; streams: FlussonicStreamInfo[] };

        if (result.success) {
          onFlussonicStreamsChange(result.streams);
        } else {
          alert("Falha ao ler categorias do Flussonic: " + result.message);
        }
      } catch (error) {
        console.error(error);
        alert("Erro ao ler categorias do Flussonic.");
      } finally {
        setLoadingStreams(false);
      }
    },
    [getConnectionConfig, onFlussonicStreamsChange, syncFn],
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
        const result = (await mirrorFn({
          data: {
            serverIp: nextServerIp,
            sshUser: nextSshUser,
            sshPassword: nextSshPassword,
            sshPort: nextSshPort,
            flussonicConfPath: "/etc/flussonic/flussonic.conf",
          },
        })) as { success: boolean; message: string; snapshot: FlussonicMirrorSnapshot | null };

        if (result.success) {
          onFlussonicMirrorChange(result.snapshot);
          onFlussonicStreamsChange(result.snapshot?.streams || []);
        } else {
          alert("Falha ao sincronizar espelho: " + result.message);
        }
      } catch (error) {
        console.error(error);
        alert("Erro ao sincronizar espelho do Flussonic.");
      } finally {
        setLoadingMirror(false);
      }
    },
    [getConnectionConfig, mirrorFn, onFlussonicMirrorChange, onFlussonicStreamsChange],
  );

  const syncMirrorAndStreams = useCallback(
    async (profileOverride?: Partial<FlussonicConnectionProfile>) => {
      await loadFlussonicMirror(profileOverride);
      await loadFlussonicStreams(profileOverride);
    },
    [loadFlussonicMirror, loadFlussonicStreams],
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
      })) as { success: boolean; message: string; endpoint: string; streams: string[] };

      if (!result.success) {
        alert(result.message);
        return;
      }

      setApiStreamsEndpoint(result.endpoint);
      setApiStreams(result.streams);
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

  const handleDownload = async (categoryName: string) => {
    if (sshStatus !== "connected") {
      alert("Conecte ao servidor via SSH primeiro!");
      return;
    }

    setDownloadingCategory(categoryName);
    setJobInProgress(true);
    try {
      const result = (await startJobFn({
        data: {
          serverIp,
          sshUser,
          sshPassword,
          sshPort: parseInt(sshPort),
          categoryName,
          items: (customCategories[categoryName] || []).map(item => ({ name: item.name, url: item.url })),
          concurrency: 3,
        },
      })) as SshResponse;

      if (result.success) {
        const initialJob: FlussonicDownloadJobStatus = {
          jobId: result.jobId || "",
          state: "queued",
          categoryName,
          streamName: result.streamName || categoryName,
          folder: result.folder || "",
          playlistPath: result.playlistPath || "",
          totalItems: customCategories[categoryName]?.length || 0,
          completedItems: 0,
          failedItems: 0,
          percent: 0,
          items: (customCategories[categoryName] || []).map(item => ({ name: item.name, url: item.url })).map((item, index) => ({
            name: item.name,
            fileName: `${String(index + 1).padStart(3, "0")}-${item.name}`,
            url: item.url,
            status: "queued",
            downloadedBytes: 0,
            totalBytes: null,
          })),
        };
        setDownloadJob(initialJob);
        alert(
          `Fila iniciada para "${categoryName}". O painel vai mostrar o progresso em tempo real.`,
        );
      } else {
        alert("Erro: " + result.message);
        setJobInProgress(false);
      }
    } catch (error) {
      alert("Erro ao enviar categoria.");
      setJobInProgress(false);
    } finally {
      setDownloadingCategory(null);
    }
  };

  useEffect(() => {
    if (!downloadJob?.jobId || sshStatus !== "connected") {
      if (jobPollRef.current) {
        window.clearInterval(jobPollRef.current);
        jobPollRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const result = (await readJobStatusFn({
          data: {
            serverIp,
            sshUser,
            sshPassword,
            sshPort: parseInt(sshPort),
            jobId: downloadJob.jobId,
          },
        })) as { success: boolean; message: string; status: FlussonicDownloadJobStatus | null };

        if (!result.success || !result.status) return;

        setDownloadJob(result.status);

        if (result.status.state === "completed" || result.status.state === "failed") {
          setJobInProgress(false);
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
    sshStatus,
    sshUser,
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
    setApiStreams([]);
    setApiStreamsEndpoint("");
    setPublicPlaylist("");
    setPublicPlaylistEndpoint("");
  }, []);

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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="bg-[#141414] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-500">
              <Server size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Configuração do Servidor</h2>
              <p className="text-sm text-neutral-400">
                Prepare seu servidor para receber os conteúdos
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
              <h3 className="font-bold text-blue-400 mb-1">Passo 1: Prepare o Flussonic</h3>
              <p className="text-sm text-neutral-300 mb-4">
                Este comando prepara a VOD location local do Flussonic para receber os vídeos
                baixados pelo painel:
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
                * Depois disso, o painel baixa os arquivos, cria a playlist e atualiza o canal
                automaticamente.
              </p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="font-bold text-neutral-400 text-xs uppercase tracking-widest flex items-center gap-2 mb-4">
              <Shield size={14} /> Passo 2: Autenticação de Acesso
            </h3>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-widest text-neutral-500">
                    Servidores salvos
                  </div>
                  <div className="text-sm text-neutral-300">
                    {savedProfiles.length > 0
                      ? `${savedProfiles.length} perfil${savedProfiles.length === 1 ? "" : "s"} disponível(eis)`
                      : "Nenhum servidor salvo ainda"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void loadFlussonicMirror()}
                    disabled={loadingMirror || sshStatus !== "connected"}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={14} />
                    Atualizar
                  </button>
                  <button
                    onClick={handleStartNewServer}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold transition-colors"
                  >
                    <Server size={14} />
                    Novo servidor
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
                            title="Remover servidor"
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
                  Nome do servidor
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
                  Senha SSH ou Chave
                </label>
                <input
                  type="password"
                  value={sshPassword}
                  onChange={(e) => setSshPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                  placeholder="Deixe em branco se a chave SSH já estiver autorizada"
                />
                <p className="text-[10px] text-neutral-500 mt-2">
                  O painel tenta usar a chave privada do servidor automaticamente antes da senha.
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
                  Servidor salvo e autorizado
                </>
              ) : (
                <>
                  <Shield size={20} />
                  Validar acesso e salvar servidor
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
                    bloco SSH.
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
                    Se o endpoint principal variar, o painel tenta automaticamente os caminhos
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
                  Consultar streams via API
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
                      : "Aguardando validação"}
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
              Sincronizar espelho
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
                Lidos direto do arquivo de configuração do servidor remoto.
              </p>
            </div>
            <span className="text-xs text-neutral-400">{flussonicStreams.length} canais</span>
          </div>
          {flussonicStreams.length === 0 ? (
            <div className="text-sm text-neutral-500 border border-dashed border-white/10 rounded-xl p-4">
              Conecte no SSH e clique em "Ler canais do Flussonic" para carregar as categorias já
              criadas.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {flussonicStreams.map((stream) => (
                <div
                  key={stream.name}
                  className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4"
                >
                  <div className="font-bold">{stream.name}</div>
                  <div className="text-xs text-neutral-500 mt-1 break-all">
                    {stream.playlistPath
                      ? `playlist:///${stream.playlistPath}`
                      : "Stream definido no Flussonic"}
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
                Espelho do Flussonic
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
              Atualizar espelho
            </button>
          </div>

          {!flussonicMirror ? (
            <div className="text-sm text-neutral-500 border border-dashed border-white/10 rounded-xl p-4">
              Conecte no SSH e sincronize o espelho para ver a árvore real do Flussonic.
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
              Baixe a categoria em fila paralela de 3 arquivos e recarregue o Flussonic em um passo
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
                <div className="text-xs text-neutral-300 mt-1">
                  {downloadJob.state === "completed"
                    ? "Concluído"
                    : downloadJob.state === "failed"
                      ? "Falhou"
                      : `Baixando ${downloadJob.completedItems}/${downloadJob.totalItems} arquivos`}
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
                Fila paralela: 3 downloads simultâneos no servidor 173.208.244.141
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              {downloadJob.items.slice(0, 5).map((item) => (
                <div
                  key={item.fileName}
                  className="flex items-center justify-between gap-3 rounded-lg bg-black/30 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{item.name}</div>
                    <div className="text-neutral-500 font-mono truncate">{item.fileName}</div>
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
                        ? `${Math.round((item.downloadedBytes / item.totalBytes) * 100)}%`
                        : `${Math.round(item.downloadedBytes / 1024 / 1024)} MB`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
                  onClick={() => handleDownload(name)}
                  disabled={
                    sshStatus !== "connected" || downloadingCategory === name || jobInProgress
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-neutral-800 disabled:text-neutral-500 rounded-lg text-sm font-bold transition-all"
                >
                  {downloadingCategory === name || jobInProgress ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Send size={16} />
                  )}
                  Criar canal no Flussonic
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
