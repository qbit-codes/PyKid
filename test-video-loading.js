// Test script to debug video loading
import { videoStorage } from './src/lib/video-storage.ts';

async function testVideoLoading() {
  console.log('=== Testing Video Loading ===');
  
  // Test 1: Load manifest
  try {
    const manifestResponse = await fetch('/videos/manifest.json');
    const manifest = await manifestResponse.json();
    console.log('✅ Manifest loaded successfully, videos found:', manifest.length);
    console.log('First video:', manifest[0]);
  } catch (error) {
    console.error('❌ Failed to load manifest:', error);
    return;
  }
  
  // Test 2: Get video for lesson
  try {
    const videoMetadata = await videoStorage.getVideoForLesson('lesson-1', 'step-1-1', 'explanation');
    console.log('✅ Video metadata retrieved:', videoMetadata);
    
    if (videoMetadata) {
      // Test 3: Generate URLs
      const urls = videoStorage.getVideoUrls(videoMetadata.id);
      console.log('✅ Video URLs generated:', urls);
      
      // Test 4: Test URL accessibility
      const primaryUrl = urls[0]?.url;
      if (primaryUrl) {
        try {
          const videoResponse = await fetch(primaryUrl, { method: 'HEAD' });
          console.log(`✅ Video URL accessible: ${primaryUrl} - Status: ${videoResponse.status}`);
        } catch (error) {
          console.error(`❌ Video URL not accessible: ${primaryUrl}`, error);
        }
      }
    }
  } catch (error) {
    console.error('❌ Failed to get video for lesson:', error);
  }
  
  // Test 5: Check environment variables
  console.log('Environment check:');
  console.log('- NODE_ENV:', import.meta.env?.MODE || 'undefined');
  console.log('- CDN enabled:', videoStorage.config?.cdn?.enabled);
  console.log('- CDN provider:', videoStorage.config?.cdn?.provider);
}

// Run test when DOM is ready
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', testVideoLoading);
} else {
  testVideoLoading();
}