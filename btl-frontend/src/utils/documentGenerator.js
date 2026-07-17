// utils/documentGenerator.js
import jsPDF from 'jspdf';
import PPTX from 'pptxgenjs';

// Helper function to resolve absolute URL
const getAbsoluteUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  
  let targetUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const cleanPath = url.startsWith('/') ? url.substring(1) : url;
    targetUrl = `http://localhost:5002/${cleanPath}`;
  }
  
  return `http://localhost:5002/api/services/proxy-image?url=${encodeURIComponent(targetUrl)}`;
};

// Helper function to load image for PDF
const loadImage = (url) => {
  return new Promise((resolve, reject) => {
    const absoluteUrl = getAbsoluteUrl(url);
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => {
      console.error(`Failed to load image at: ${absoluteUrl}`, err);
      reject(err);
    };
    img.src = absoluteUrl;
  });
};

// Helper function to fetch image as Base64 for PPT with better handling
const fetchImageAsBase64 = async (url) => {
  try {
    const absoluteUrl = getAbsoluteUrl(url);
    console.log('Fetching image for PPT:', absoluteUrl);
    
    const response = await fetch(absoluteUrl, {
      mode: 'cors',
      headers: {
        'Accept': 'image/*'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        // Parse type from data:image/png;base64,...
        const match = result.match(/^data:image\/([a-z]+);base64,/);
        const type = match ? match[1] : 'jpg';
        // Get the full data URL including the prefix
        const fullDataUrl = result;
        resolve({ 
          data: fullDataUrl, 
          type: type === 'jpeg' ? 'jpg' : type 
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`Error converting image to Base64 for URL ${url}:`, error);
    return null;
  }
};

// Helper function to extract images from various input formats
const extractImages = (input) => {
  let photos = [];
  let title = 'Service_Report';
  
  if (!input) {
    return { photos: [], title: 'Service_Report' };
  }
  
  // Handle different input formats
  if (Array.isArray(input)) {
    photos = input;
  } else if (input && typeof input === 'object') {
    if (input.images && Array.isArray(input.images)) {
      photos = input.images;
      title = input.serviceName || input.businessName || input.title || 'Service_Report';
    } else if (input.url || input.file_url) {
      photos = [input];
      title = input.serviceName || input.businessName || input.title || 'Service_Report';
    } else if (input.photos && Array.isArray(input.photos)) {
      photos = input.photos;
      title = input.serviceName || input.businessName || input.title || 'Service_Report';
    }
  }
  
  // Normalize photos array
  photos = photos.filter(p => p).map(photo => {
    if (typeof photo === 'string') {
      return { 
        file_url: photo, 
        url: photo,
        file_name: photo.split('/').pop() || 'image.jpg',
        captured_at: new Date().toISOString()
      };
    }
    if (!photo.file_url && photo.url) {
      photo.file_url = photo.url;
    }
    if (!photo.file_name && photo.url) {
      photo.file_name = photo.url.split('/').pop() || 'image.jpg';
    }
    return photo;
  });
  
  // Validate images
  photos = photos.filter(photo => {
    const url = photo.file_url || photo.url;
    return url && typeof url === 'string' && url.trim().length > 0;
  });
  
  return { photos, title: String(title || 'Service_Report') };
};

export const generatePDF = async (photosInput, titleInput) => {
  try {
    let { photos, title } = extractImages(photosInput);
    if (titleInput && typeof titleInput === 'string') {
      title = titleInput;
    }
    
    if (!photos || photos.length === 0) {
      alert('No images available to generate PDF');
      return;
    }

    // Show loading indicator
    const loadingMessage = document.createElement('div');
    loadingMessage.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 24px 32px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(1, 81, 186, 0.3);
      z-index: 9999;
      font-size: 18px;
      font-weight: bold;
      color: #0151ba;
      display: flex;
      align-items: center;
      gap: 12px;
      border: 2px solid #f2c43b;
    `;
    loadingMessage.innerHTML = `
      <span style="font-size: 24px;">📄</span>
      <span>Generating PDF... Please wait</span>
      <div style="
        width: 20px;
        height: 20px;
        border: 3px solid #f2c43b;
        border-top: 3px solid #0151ba;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      "></div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;
    document.body.appendChild(loadingMessage);

    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    
    const imagesPerPage = 4;
    const gridCols = 2;
    const gridRows = 2;
    
    const contentWidth = pageWidth - (margin * 2);
    const contentHeight = pageHeight - (margin * 2) - 20;
    
    const cellWidth = contentWidth / gridCols;
    const cellHeight = contentHeight / gridRows;
    
    const imagePadding = 5;
    const imageWidth = cellWidth - (imagePadding * 2);
    const imageHeight = cellHeight - 35;

    const totalPages = Math.ceil(photos.length / imagesPerPage);

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      if (pageIndex > 0) {
        pdf.addPage();
      }

      let yPosition = margin;
      
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text(`${title} - Page ${pageIndex + 1} of ${totalPages}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 8;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Generated on: ${new Date().toLocaleDateString()} | Total Images: ${photos.length}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 15;

      const startIndex = pageIndex * imagesPerPage;
      const endIndex = Math.min(startIndex + imagesPerPage, photos.length);
      const pagePhotos = photos.slice(startIndex, endIndex);

      for (let i = 0; i < pagePhotos.length; i++) {
        const photo = pagePhotos[i];
        const photoIndex = startIndex + i;
        
        const row = Math.floor(i / gridCols);
        const col = i % gridCols;
        
        const x = margin + (col * cellWidth) + imagePadding;
        const y = yPosition + (row * cellHeight);

        try {
          const imageUrl = photo.file_url || photo.url;
          if (!imageUrl) {
            throw new Error('No image URL available');
          }
          
          const img = await loadImage(imageUrl);
          
          const aspectRatio = img.width / img.height;
          let displayWidth = imageWidth;
          let displayHeight = imageHeight;
          
          if (aspectRatio > 1) {
            displayHeight = imageWidth / aspectRatio;
          } else {
            displayWidth = imageHeight * aspectRatio;
          }
          
          const xOffset = (imageWidth - displayWidth) / 2;
          const yOffset = (imageHeight - displayHeight) / 2;
          
          pdf.setDrawColor(200, 200, 200);
          pdf.setFillColor(250, 250, 250);
          pdf.rect(x - 2, y - 2, imageWidth + 4, imageHeight + 4, 'FD');
          
          pdf.addImage(img, 'JPEG', x + xOffset, y + yOffset, displayWidth, displayHeight);

          const infoStartY = y + imageHeight + 5;
          let currentY = infoStartY;
          
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(0, 0, 0);
          
          const caption = `Image ${photoIndex + 1}`;
          pdf.text(caption, x + imageWidth / 2, currentY, { align: 'center' });
          currentY += 4;

          pdf.setFontSize(7);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(80, 80, 80);
          
          const fileName = (photo.file_name || 'image').length > 25 ? 
            (photo.file_name || 'image').substring(0, 22) + '...' : 
            (photo.file_name || 'image');
          pdf.text(fileName, x + imageWidth / 2, currentY, { align: 'center' });
          currentY += 4;

          if (photo.captured_at) {
            pdf.setFontSize(6);
            pdf.setTextColor(120, 120, 120);
            const captureDateTime = new Date(photo.captured_at).toLocaleString();
            pdf.text(`📅 ${captureDateTime}`, x + imageWidth / 2, currentY, { align: 'center' });
          }

        } catch (error) {
          console.error(`Error loading image ${photo.file_name || 'unknown'}:`, error);
          
          pdf.setDrawColor(220, 220, 220);
          pdf.setFillColor(245, 245, 245);
          pdf.rect(x - 2, y - 2, imageWidth + 4, imageHeight + 4, 'FD');
          
          pdf.setFontSize(10);
          pdf.setTextColor(150, 150, 150);
          pdf.text('Image Not Available', x + imageWidth / 2, y + imageHeight / 2, { align: 'center' });
          
          const infoStartY = y + imageHeight + 5;
          pdf.setFontSize(9);
          pdf.setTextColor(0, 0, 0);
          pdf.text(`Image ${photoIndex + 1}`, x + imageWidth / 2, infoStartY, { align: 'center' });
        }
      }
    }

    const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_Service_Report.pdf`;
    pdf.save(fileName);
    document.body.removeChild(loadingMessage);
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Error generating PDF. Please try again.');
    const loadingMsg = document.querySelector('div[style*="z-index: 9999"]');
    if (loadingMsg && loadingMsg.parentNode) {
      loadingMsg.parentNode.removeChild(loadingMsg);
    }
  }
};

export const generatePPT = async (photosInput, titleInput) => {
  try {
    let { photos, title } = extractImages(photosInput);
    if (titleInput && typeof titleInput === 'string') {
      title = titleInput;
    }
    
    if (!photos || photos.length === 0) {
      alert('No images available to generate PowerPoint');
      return;
    }

    // Show loading indicator
    const loadingMessage = document.createElement('div');
    loadingMessage.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 24px 32px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(1, 81, 186, 0.3);
      z-index: 9999;
      font-size: 18px;
      font-weight: bold;
      color: #0151ba;
      display: flex;
      align-items: center;
      gap: 12px;
      border: 2px solid #f2c43b;
    `;
    loadingMessage.innerHTML = `
      <span style="font-size: 24px;">📊</span>
      <span>Generating PowerPoint... Please wait</span>
      <div style="
        width: 20px;
        height: 20px;
        border: 3px solid #f2c43b;
        border-top: 3px solid #0151ba;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      "></div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;
    document.body.appendChild(loadingMessage);

    // Create PPTX instance
    const pptx = new PPTX();
    
    // Set presentation properties
    pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
    pptx.layout = 'WIDE';
    pptx.title = title;
    pptx.author = 'GMS';
    pptx.company = 'GMS';
    pptx.subject = 'Service Report';

    // Title slide
    const titleSlide = pptx.addSlide();
    titleSlide.background = { fill: 'FFFFFF' };

    titleSlide.addText('GMS', {
      x: 0.5,
      y: 0.5,
      w: '90%',
      h: 0.8,
      fontSize: 32,
      bold: true,
      color: '0151ba',
      align: 'center'
    });

    titleSlide.addText(title, {
      x: 0.5,
      y: 1.8,
      w: '90%',
      h: 1.0,
      fontSize: 36,
      bold: true,
      color: '000000',
      align: 'center'
    });

    titleSlide.addText(`Service Report - ${new Date().toLocaleDateString()}`, {
      x: 0.5,
      y: 3.2,
      w: '90%',
      h: 0.6,
      fontSize: 20,
      color: '666666',
      align: 'center'
    });

    titleSlide.addText(
      `Total Images: ${photos.length}`,
      {
        x: 0.5,
        y: 4.0,
        w: '90%',
        h: 0.8,
        fontSize: 18,
        color: '666666',
        align: 'center'
      }
    );

    // Process images - 2 per slide
    const imagesPerSlide = 2;
    const totalSlides = Math.ceil(photos.length / imagesPerSlide);

    // Pre-fetch all images to avoid issues during slide creation
    const imageDataArray = [];
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const imageUrl = photo.file_url || photo.url;
      if (imageUrl) {
        try {
          const imgData = await fetchImageAsBase64(imageUrl);
          if (imgData) {
            imageDataArray.push({
              index: i,
              data: imgData,
              photo: photo
            });
          } else {
            console.warn(`Failed to fetch image ${i + 1}`);
            imageDataArray.push({
              index: i,
              data: null,
              photo: photo
            });
          }
        } catch (error) {
          console.error(`Error fetching image ${i + 1}:`, error);
          imageDataArray.push({
            index: i,
            data: null,
            photo: photo
          });
        }
      } else {
        imageDataArray.push({
          index: i,
          data: null,
          photo: photo
        });
      }
    }

    // Create slides with pre-fetched images
    for (let slideIndex = 0; slideIndex < totalSlides; slideIndex++) {
      const slide = pptx.addSlide();
      slide.background = { fill: 'FFFFFF' };
      
      // Add slide header
      slide.addText('GMS', {
        x: 0.3,
        y: 0.1,
        w: 2.0,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: '0151ba'
      });

      slide.addText(`${title} - Page ${slideIndex + 1} of ${totalSlides}`, {
        x: 0.5,
        y: 0.15,
        w: '90%',
        h: 0.5,
        fontSize: 18,
        bold: true,
        color: '000000',
        align: 'center'
      });

      const startIndex = slideIndex * imagesPerSlide;
      const endIndex = Math.min(startIndex + imagesPerSlide, photos.length);
      
      // Positions for 2 images
      const positions = [
        { x: 0.8, y: 1.2, w: 5.5, h: 4.5 },
        { x: 7.0, y: 1.2, w: 5.5, h: 4.5 }
      ];

      for (let i = 0; i < (endIndex - startIndex); i++) {
        const globalIndex = startIndex + i;
        const imageData = imageDataArray[globalIndex];
        const position = positions[i];
        const photo = imageData.photo;
        const photoIndex = globalIndex + 1;

        try {
          // Add image placeholder background
          slide.addShape(pptx.ShapeType.rect, {
            x: position.x - 0.1,
            y: position.y - 0.1,
            w: position.w + 0.2,
            h: position.h + 0.2,
            fill: { color: 'F8F9FA' },
            line: { color: 'DEE2E6', width: 1 }
          });

          if (imageData.data) {
            // Add image with proper data URL
            slide.addImage({
              data: imageData.data.data,
              type: imageData.data.type || 'jpg',
              x: position.x,
              y: position.y,
              w: position.w,
              h: position.h,
              sizing: { 
                type: 'contain', 
                w: position.w, 
                h: position.h 
              }
            });
          } else {
            // Placeholder for failed image
            slide.addText('Image Not Available', {
              x: position.x,
              y: position.y + position.h / 2 - 0.3,
              w: position.w,
              h: 0.6,
              fontSize: 16,
              color: '6C757D',
              align: 'center'
            });
          }

          // Image info below
          const infoY = position.y + position.h + 0.3;
          
          slide.addText(`Image ${photoIndex}`, {
            x: position.x,
            y: infoY,
            w: position.w,
            h: 0.25,
            fontSize: 12,
            bold: true,
            color: '000000',
            align: 'center'
          });

          const fileName = (photo.file_name || 'image').length > 30 ? 
            (photo.file_name || 'image').substring(0, 27) + '...' : 
            (photo.file_name || 'image');
          slide.addText(fileName, {
            x: position.x,
            y: infoY + 0.25,
            w: position.w,
            h: 0.2,
            fontSize: 10,
            color: '495057',
            align: 'center'
          });

          if (photo.captured_at) {
            const captureDateTime = new Date(photo.captured_at).toLocaleString();
            slide.addText(`📅 ${captureDateTime}`, {
              x: position.x,
              y: infoY + 0.45,
              w: position.w,
              h: 0.2,
              fontSize: 9,
              color: '6C757D',
              align: 'center'
            });
          }

        } catch (error) {
          console.error(`Error adding image ${globalIndex + 1} to slide:`, error);
          
          // Error placeholder
          slide.addShape(pptx.ShapeType.rect, {
            x: position.x - 0.1,
            y: position.y - 0.1,
            w: position.w + 0.2,
            h: position.h + 0.2,
            fill: { color: 'FFF5F5' },
            line: { color: 'FEB2B2', width: 1 }
          });

          slide.addText('Error Loading Image', {
            x: position.x,
            y: position.y + position.h / 2 - 0.3,
            w: position.w,
            h: 0.6,
            fontSize: 14,
            color: 'E53E3E',
            align: 'center'
          });

          const infoY = position.y + position.h + 0.3;
          slide.addText(`Image ${photoIndex}`, {
            x: position.x,
            y: infoY,
            w: position.w,
            h: 0.25,
            fontSize: 12,
            bold: true,
            color: '000000',
            align: 'center'
          });
        }
      }
    }

    // Summary slide
    const summarySlide = pptx.addSlide();
    summarySlide.background = { fill: 'FFFFFF' };
    
    summarySlide.addText('GMS', {
      x: 0.5,
      y: 0.5,
      w: '90%',
      h: 0.8,
      fontSize: 32,
      bold: true,
      color: '0151ba',
      align: 'center'
    });

    summarySlide.addText('Service Summary', {
      x: 0.5,
      y: 1.8,
      w: '90%',
      h: 1.0,
      fontSize: 36,
      bold: true,
      align: 'center'
    });

    summarySlide.addText(
      `Total Images Documented: ${photos.length}\n` +
      `Total Slides: ${totalSlides + 2}\n` +
      `Report Generated: ${new Date().toLocaleDateString()}\n\n` +
      'GMS - Quality Service Documentation',
      {
        x: 0.5,
        y: 3.2,
        w: '90%',
        h: 3.0,
        fontSize: 16,
        align: 'center',
        color: '4A5568'
      }
    );

    // Save PowerPoint
    const fileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_Service_Presentation.pptx`;
    await pptx.writeFile({ fileName: fileName });
    
    // Remove loading message
    document.body.removeChild(loadingMessage);
    
  } catch (error) {
    console.error('Error generating PowerPoint:', error);
    alert('Error generating PowerPoint. Please try again.\n\nError: ' + (error.message || 'Unknown error'));
    
    const loadingMsg = document.querySelector('div[style*="z-index: 9999"]');
    if (loadingMsg && loadingMsg.parentNode) {
      loadingMsg.parentNode.removeChild(loadingMsg);
    }
  }
};

// Main export function
export const generateDocument = async (photos, title = 'Service Report', format = 'pdf') => {
  try {
    if (format === 'pdf') {
      await generatePDF(photos, title);
    } else if (format === 'ppt') {
      await generatePPT(photos, title);
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }
  } catch (error) {
    console.error(`Error generating ${format}:`, error);
    throw error;
  }
};

export default {
  generatePDF,
  generatePPT,
  generateDocument
};