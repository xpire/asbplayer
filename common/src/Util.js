export function humanReadableTime(timestamp) {
    const totalSeconds = Math.floor(timestamp / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);

    if (hours > 0) {
        return hours + "h" + String(minutes).padStart(2, '0') + "m" + String(seconds).padStart(2, '0') + "s";
    }

    return minutes + "m" + String(seconds).padStart(2, '0') + "s";
}

export function surroundingSubtitles(subtitles, index, countRadius, timeRadius) {
    let startIndex;
    let endIndex;

    for (let i = index; i >= 0; --i) {
        startIndex = i;

        if (atBoundary(subtitles, startIndex, index, countRadius, timeRadius, false)) {
            break;
        }
    }

    for (let i = index; i <= subtitles.length - 1; ++i) {
        endIndex = i;

        if (atBoundary(subtitles, endIndex, index, countRadius, timeRadius, true)) {
            break;
        }
    }

    return subtitles.slice(startIndex, endIndex + 1);
}

function atBoundary(subtitles, index, initialIndex, countRadius, timeRadius, sign) {
    let next;

    if (sign) {
        next = index + 1 < subtitles.length ? subtitles[index + 1] : null;
    } else {
        next = index - 1 >= 0 ? subtitles[index - 1] : null;
    }

    if (Math.abs(initialIndex - index) >= countRadius
        && (next === null || Math.abs(next.start - subtitles[initialIndex].start) >= timeRadius)) {
        return true;
    }

    return false;
}