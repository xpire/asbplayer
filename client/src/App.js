import React, { useCallback, useState, useMemo, useRef } from 'react';
import { Route, Redirect, Switch, useLocation } from "react-router-dom";
import { makeStyles } from '@material-ui/core/styles';
import { useWindowSize } from './Util';
import clsx from 'clsx';
import Alert from './Alert.js';
import Api from './Api.js';
import Bar from './Bar.js';
import ChromeExtension from './ChromeExtension.js';
import CopyHistory from './CopyHistory.js';
import Player from './Player.js';
import VideoPlayer from './VideoPlayer.js';

const useStyles = drawerWidth => makeStyles((theme) => ({
    content: {
        flexGrow: 1,
        transition: theme.transitions.create('margin', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
        }),
        marginRight: 0,
    },
    contentShift: {
        transition: theme.transitions.create('margin', {
            easing: theme.transitions.easing.easeOut,
            duration: theme.transitions.duration.enteringScreen,
        }),
        marginRight: drawerWidth,
    },
}));

function Content(props) {
    const classes = useStyles(props.drawerWidth)();
    return (
        <main
            className={clsx(classes.content, {
                [classes.contentShift]: props.drawerOpen,
            })}>
        {props.children}
        </main>
    );
}

function App() {
    const api = useMemo(() => new Api(), []);
    const extension = useMemo(() => new ChromeExtension(), []);
    const location = useLocation();
    const videoFrameRef = useRef();
    const [width, ] = useWindowSize(location.pathname !== '/video');
    const drawerRatio = videoFrameRef.current ? .2 : .3;
    const minDrawerSize = videoFrameRef.current ? 300 : 400;
    const drawerWidth = Math.max(minDrawerSize, width * drawerRatio);
    const [copiedSubtitles, setCopiedSubtitles] = useState([]);
    const [copyHistoryOpen, setCopyHistoryOpen] = useState(false);
    const [alert, setAlert] = useState();
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertSeverity, setAlertSeverity] = useState();
    const [jumpToSubtitle, setJumpToSubtitle] = useState();
    const [sources, setSources] = useState({});
    const [fileName, setFileName] = useState();
    const offsetRef = useRef();
    const { subtitleFile } = sources;

    const handleCopy = useCallback((subtitle, audioFile, videoFile, subtitleFile, audioTrack) => {
        setCopiedSubtitles(copiedSubtitles => [...copiedSubtitles, {
            ...subtitle,
            timestamp: Date.now(),
            name: fileName,
            subtitleFile: subtitleFile,
            audioFile: audioFile,
            videoFile: videoFile,
            audioTrack: audioTrack
        }]);
        setAlertSeverity("success");
        setAlert("Copied " + subtitle.text);
        setAlertOpen(true);
    }, [fileName]);

    const handleOpenCopyHistory = useCallback((event) => {
        setCopyHistoryOpen(!copyHistoryOpen);
    }, [copyHistoryOpen]);

    const handleCloseCopyHistory = useCallback(() => {
        setCopyHistoryOpen(false);
    }, [setCopyHistoryOpen]);

    const handleDeleteCopyHistoryItem = useCallback(item => {
        const newCopiedSubtitles = [];

        for (let subtitle of copiedSubtitles) {
            if (item.timestamp !== subtitle.timestamp) {
                newCopiedSubtitles.push(subtitle);
            }
        }

        setCopiedSubtitles(newCopiedSubtitles);
    }, [copiedSubtitles]);

    const handleAlertClosed = useCallback(() => {
        setAlertOpen(false);
    }, []);

    const handleError = useCallback((message) => {
        setAlertSeverity("error");
        setAlert(message);
        setAlertOpen(true);
    }, []);

    const handleUnloadAudio = useCallback((audioFileUrl) => {
        if (audioFileUrl !== sources.audioFileUrl) {
            return;
        }

        setSources(previous => {
            URL.revokeObjectURL(audioFileUrl);

            return {
                subtitleFile: previous.subtitleFile,
                audioFile: null,
                audioFileUrl: null,
                videoFile: previous.videoFile,
                videoFileUrl: previous.videoFileUrl
            };
        });
    }, [sources]);

    const handleUnloadVideo = useCallback((videoFileUrl) => {
        if (videoFileUrl !== sources.videoFileUrl) {
            return;
        }

        setSources(previous => {
            URL.revokeObjectURL(videoFileUrl);

            return {
                subtitleFile: previous.subtitleFile,
                audioFile: previous.audioFile,
                audioFileUrl: previous.audioFileUrl,
                videoFile: null,
                videoFileUrl: null
            };
        });
    }, [sources]);

    const handleClipAudio = useCallback(item => {
        const offset = offsetRef.current || 0;
        if (item.audioFile) {
            api.clipAudioFromAudioFile(
                item.audioFile,
                item.originalStart + offset,
                item.originalEnd + offset
            )
            .catch(e => {
                handleError(e.message);
            });
        } else if (item.videoFile) {
            api.clipAudioFromVideoFile(
                item.videoFile,
                item.originalStart + offset,
                item.originalEnd + offset,
                item.audioTrack
            )
            .catch(e => {
                handleError(e.message);
            });
        }
    }, [api, handleError]);

    const handleSelectCopyHistoryItem = useCallback((item) => {
        if (subtitleFile.name !== item.subtitleFile.name) {
            handleError("Subtitle file " + item.subtitleFile.name + " is not open.");
            return;
        }

        setJumpToSubtitle({text: item.text, originalStart: item.originalStart});
    }, [subtitleFile, handleError]);

    function revokeUrls(sources) {
        if (sources.audioFileUrl) {
            URL.revokeObjectURL(sources.audioFileUrl);
        }

        if (sources.videoFileUrl) {
            URL.revokeObjectURL(sources.videoFileUrl);
        }
    }

    function extractSources(files) {
        let subtitleFile = null;
        let audioFile = null;
        let videoFile = null;

        for(const f of files) {
            const extensionStartIndex = f.name.lastIndexOf(".");

            if (extensionStartIndex === -1) {
                throw new Error('Unable to determine extension of ' + f.name);
            }

            const extension = f.name.substring(extensionStartIndex + 1, f.name.length);
            switch (extension) {
                case "ass":
                case "srt":
                    if (subtitleFile) {
                        throw new Error('Cannot open two subtitle files simultaneously');
                    }
                    subtitleFile = f;
                    break;
                case "mkv":
                    if (videoFile) {
                        throw new Error('Cannot open two video files simultaneously');
                    }
                    videoFile = f;
                    break;
                case "mp3":
                    if (audioFile) {
                        throw new Error('Cannot open two audio files simultaneously');
                    }
                    audioFile = f;
                    break;
                default:
                    throw new Error("Unsupported extension " + extension);
            }
        }

        if (videoFile && audioFile) {
            throw new Error("Cannot load both an audio and video file simultaneously");
        }

        return {subtitleFile: subtitleFile, audioFile: audioFile, videoFile: videoFile}
    }

    const handleDrop = useCallback((e) => {
        e.preventDefault();

        if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) {
            return;
        }

        try {
            let {subtitleFile, audioFile, videoFile} = extractSources(e.dataTransfer.files);

            setSources(previous => {
                let videoFileUrl = null;
                let audioFileUrl = null;

                if (videoFile || audioFile) {
                    revokeUrls(previous);

                    if (videoFile) {
                        videoFileUrl = URL.createObjectURL(videoFile);
                    } else if (audioFile) {
                        audioFileUrl = URL.createObjectURL(audioFile);
                    }
                } else {
                    videoFile = previous.videoFile;
                    videoFileUrl = previous.videoFileUrl;
                    audioFile = previous.audioFile;
                    audioFileUrl = previous.audioFileUrl;
                }

                const sources = {
                    subtitleFile: subtitleFile || previous.subtitleFile,
                    audioFile: audioFile,
                    audioFileUrl: audioFileUrl,
                    videoFile: videoFile,
                    videoFileUrl: videoFileUrl
                };

                return sources;
            });

            if (subtitleFile) {
                setFileName(subtitleFile.name);
            }
        } catch (e) {
            handleError(e.message);
        }
    }, [handleError]);

    return (
        <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
        >
            <Alert
                open={alertOpen}
                onClose={handleAlertClosed}
                autoHideDuration={3000}
                severity={alertSeverity}
            >
                {alert}
            </Alert>
            <Switch>
                <Route exact path="/" render={() => {
                    const params = new URLSearchParams(window.location.search);
                    const videoFile = params.get('video');
                    const channel = params.get('channel');
                    const popOut = params.get('popout');

                    if (videoFile && channel) {
                        return (<Redirect to={"/video?video=" + encodeURIComponent(videoFile) + "&channel=" + channel + "&popout=" + popOut} />);
                    }

                    return (
                        <div>
                            <CopyHistory
                                items={copiedSubtitles}
                                open={copyHistoryOpen}
                                drawerWidth={drawerWidth}
                                onClose={handleCloseCopyHistory}
                                onDelete={handleDeleteCopyHistoryItem}
                                onClipAudio={handleClipAudio}
                                onSelect={handleSelectCopyHistoryItem}
                            />
                            <Bar
                                title={fileName || "a subtitle player"}
                                drawerWidth={drawerWidth}
                                drawerOpen={copyHistoryOpen}
                                onOpenCopyHistory={handleOpenCopyHistory}
                            />
                            <Content drawerWidth={drawerWidth} drawerOpen={copyHistoryOpen}>
                                <Player
                                    api={api}
                                    onCopy={handleCopy}
                                    onError={handleError}
                                    onUnloadAudio={handleUnloadAudio}
                                    onUnloadVideo={handleUnloadVideo}
                                    offsetRef={offsetRef}
                                    videoFrameRef={videoFrameRef}
                                    sources={sources}
                                    jumpToSubtitle={jumpToSubtitle}
                                    videoFrameRef={videoFrameRef}
                                    extension={extension}
                                    drawerOpen={copyHistoryOpen}
                                />
                            </Content>
                        </div>
                    );
                }} />
                <Route exact path="/video" render={() => {
                    const params = new URLSearchParams(window.location.search);
                    const videoFile = params.get('video');
                    const channel = params.get('channel');
                    const popOut = params.get('popout') === 'true';

                    return (
                        <VideoPlayer
                            api={api}
                            videoFile={videoFile}
                            popOut={popOut}
                            channel={channel}
                            onError={handleError}
                        />
                    );
                }} />
            </Switch>
        </div>
    );
}

export default App;