import io
import re
from flask import Flask, render_template, request, jsonify, send_file
import pytesseract
from PIL import Image
from docx import Document
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from googletrans import Translator

app = Flask(__name__)

# Function to clean and format extracted text
def clean_and_format_text(text):
    text = re.sub(r'\s+', ' ', text)
    lines = text.splitlines()
    formatted_text = ""
    for line in lines:
        line = line.strip()
        if len(line) > 100:
            sentences = re.split(r'(?<=[.!?]) +', line)
            formatted_text += "\n".join(sentences) + "\n\n"
        else:
            formatted_text += line + "\n"
    formatted_text = re.sub(r'(?<!\n)\n(?!\n)', '\n\n', formatted_text)
    return formatted_text.strip()

# Serve the HTML page
@app.route('/')
def index():
    return render_template('index.html')

# Upload and process image (OCR)
@app.route('/upload', methods=['POST'])
def upload_image():
    file = request.files['image']
    image = Image.open(file.stream)
    extracted_text = pytesseract.image_to_string(image)
    cleaned_text = clean_and_format_text(extracted_text)
    return jsonify({'text': cleaned_text})

# Download edited document in various formats
@app.route('/download', methods=['POST'])
def download_file():
    data = request.json
    text = data['text']  # This is the edited translated text
    format = data['format']
    language = data['language']

    if format == 'txt':
        return download_txt(text, language)
    elif format == 'docx':
        return download_docx(text, language)
    elif format == 'pdf':
        return download_pdf(text, language)
    else:
        return jsonify({'error': 'Unsupported format'}), 400

def download_txt(text, language):
    buffer = io.BytesIO()
    buffer.write(text.encode('utf-8'))
    buffer.seek(0)
    return send_file(buffer, mimetype='text/plain', as_attachment=True, download_name=f'document_{language}.txt')

def download_docx(text, language):
    buffer = io.BytesIO()
    doc = Document()
    doc.add_paragraph(text)
    doc.save(buffer)
    buffer.seek(0)
    return send_file(buffer, mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                     as_attachment=True, download_name=f'document_{language}.docx')

def download_pdf(text, language):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    story = []
    styles = getSampleStyleSheet()
    style_normal = styles['Normal']

    for line in text.splitlines():
        para = Paragraph(line, style_normal)
        story.append(para)
        story.append(Spacer(1, 12))
    
    doc.build(story)
    buffer.seek(0)
    return send_file(buffer, mimetype='application/pdf', as_attachment=True, download_name=f'document_{language}.pdf')

translator = Translator()

# Translation route
@app.route('/translate', methods=['POST'])
def translate_text():
    data = request.json
    text = data['text']  # This could be the original or edited translated text
    target_language = data['language']
    translated = translator.translate(text, dest=target_language)
    return jsonify({'translatedText': translated.text})

if __name__ == '__main__':
    app.run(debug=True)
