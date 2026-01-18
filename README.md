# RadiAnt DICOM Viewer Clone

A comprehensive web-based DICOM viewer clone of RadiAnt DICOM Viewer with all major features.

## Features

- **Multiple DICOM Format Support**: CR, DX, MG, CT, MR, PET-CT, US, XA, NM, SC, SR
- **Image Manipulation**: Zoom, pan, brightness/contrast, rotation, flip
- **Measurement Tools**: Length, angle, ROI (circle/ellipse), mean/min/max values
- **Multi-Series Comparison**: View and compare multiple series simultaneously
- **PACS Client**: Query and retrieve studies from PACS servers
- **Local Archive**: Import and manage DICOM studies locally
- **2D/3D MPR**: Multi-planar reconstructions
- **3D Volume Rendering**: Interactive 3D visualization
- **PET-CT Fusion**: Overlay PET images on CT scans
- **DSA**: Digital Subtraction Angiography
- **Time-Intensity Curves**: TIC visualization for dynamic studies
- **Export**: JPEG, BMP, WMV export functionality
- **Multi-touch Support**: Gesture controls for touch devices

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Technologies

- React 18 + TypeScript
- Vite
- Cornerstone.js (DICOM rendering)
- Three.js (3D rendering)
- Zustand (state management)
