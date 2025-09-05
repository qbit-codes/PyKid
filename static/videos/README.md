# PyKid Video Files

This directory contains video files for PyKid lessons. In production, these videos will be served from Bunny.net CDN.

## Directory Structure

```
videos/
├── manifest.json                    # Video metadata and configuration
├── intro_lesson-1.mp4              # Lesson 1 introduction video
├── help_lesson-1.mp4               # Lesson 1 help video (after 3 failed attempts)
├── explanation_lesson-1_step-1-1.mp4  # Step-specific explanation videos
├── thumbnails/                      # Video thumbnail images
│   ├── lesson-1-intro.jpg
│   └── lesson-1-help.jpg
└── subtitles/                       # WebVTT subtitle files
    ├── intro_lesson-1.tr.vtt
    └── help_lesson-1.tr.vtt
```

## Video Naming Convention

### Intro Videos (Lesson Start)
- Format: `intro_{lessonId}.mp4`
- Trigger: When user starts a new lesson
- Duration: Max 30 seconds
- Content: Welcome message and lesson overview

### Help Videos (After Failed Attempts)
- Format: `help_{lessonId}.mp4`
- Trigger: After 3 consecutive failed attempts
- Duration: 2-3 minutes
- Content: Interactive "Do you need help?" and guidance

### Explanation Videos (Step-specific)
- Format: `explanation_{lessonId}_{stepId}.mp4`
- Trigger: Manual activation from lesson content
- Duration: 1-3 minutes
- Content: Detailed explanation of concepts

## Technical Requirements

- **Format**: MP4 (H.264 video, AAC audio)
- **Resolution**: 720p minimum (1280x720)
- **Aspect Ratio**: 16:9
- **Bitrate**: ~1.5 Mbps for 720p
- **Audio**: 128 kbps AAC
- **Subtitles**: WebVTT format in Turkish

## Production Deployment

In production, upload these videos to your Bunny.net pull zone with the same file structure and naming convention. The system will automatically use CDN URLs instead of local files.

## Current Status

This directory currently contains placeholder structure. Add your actual video files following the naming convention above.