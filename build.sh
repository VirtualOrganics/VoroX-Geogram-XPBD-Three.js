#!/bin/bash

# Build script for Geogram-VoroX-Three.js
# Requires Emscripten SDK to be installed and activated

echo "Building Geogram-VoroX-Three.js..."

# Check if emcc is available
if ! command -v em++ &> /dev/null; then
    echo "Error: Emscripten not found. Please install and activate the Emscripten SDK."
    echo "See: https://emscripten.org/docs/getting_started/downloads.html"
    exit 1
fi

# Navigate to source directory
cd src/cpp

# Compile with Emscripten
em++ --bind -o ../../dist/periodic_delaunay.js \
    periodic_delaunay.cpp Delaunay_psm.cpp \
    -I. \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME="PeriodicDelaunayModule" \
    -s ASSERTIONS=1 \
    -std=c++17 \
    -O2

# Build the regular triangulation bindings as a separate output (Phase 1)
em++ --bind -o ../../dist/regular_triangulation.js \
    regular_triangulation.cpp bindings_regular_triangulation.cpp \
    -I. \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME="RegularTriangulationModule" \
    -s ASSERTIONS=1 \
    -std=c++17 \
    -O2

# Check if compilation was successful
if [ $? -eq 0 ]; then
    echo "Build successful! Output files:"
    echo "  - dist/periodic_delaunay.js"
    echo "  - dist/periodic_delaunay.wasm"
    echo "  - dist/regular_triangulation.js"
    echo "  - dist/regular_triangulation.wasm"
else
    echo "Build failed!"
    exit 1
fi 