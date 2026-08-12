# import os
# print("Starting segmentation_api.py...", flush=True)
# import torch
# import numpy as np
# from PIL import Image
# import base64
# from flask import Flask, request, jsonify
# from flask_cors import CORS
# from transformers import SamModel, SamProcessor
# import cv2 # For OpenCV operations like contour finding

# app = Flask(__name__)
# CORS(app) # Enable CORS for frontend communication

# # --- SAM Model Loading ---
# # This part is memory and time-intensive. It runs once when the Flask app starts.
# model_id = "facebook/sam-vit-base"
# sam_processor = None
# sam_model = None

# try:
#     print(f"Loading SAM processor and model: {model_id}")
#     sam_processor = SamProcessor.from_pretrained(model_id)
#     sam_model = SamModel.from_pretrained(model_id)
#     print("SAM model loaded successfully.")

#     # Move model to GPU if available
#     if torch.cuda.is_available():
#         sam_model.to("cuda")
#         print("SAM model moved to GPU.")
#     else:
#         print("CUDA not available. SAM model running on CPU.")

# except Exception as e:
#     print(f"Error loading SAM model: {e}")
#     with open("model_loading_error.txt", "w") as f:
#         f.write(f"Error loading SAM model: {str(e)}\n")
#         import traceback
#         f.write(traceback.format_exc())
#     sam_processor = None
#     sam_model = None

# # --- Helper Functions ---
# def get_largest_mask(masks):
#     """Given a list of masks, returns the largest one."""
#     if not masks:
#         return None
    
#     largest_mask = None
#     max_area = 0

#     for mask in masks:
#         area = np.sum(mask) # Sum of true pixels gives area
#         if area > max_area:
#             max_area = area
#             largest_mask = mask
#     return largest_mask

# def process_image_for_walls(image_path: str, prompt_point: list[int] = None):
#     """
#     Processes an image using SAM to identify a wall.
#     """
#     if sam_model is None or sam_processor is None:
#         print("SAM model not loaded. Cannot process image.")
#         return None

#     with Image.open(image_path) as img:
#         image = img.convert("RGB")
#         w, h = image.size
        
#         # If no prompt point is provided, default to the center of the image
#         # for an "automatic" initial wall detection
#         if prompt_point is None:
#             prompt_point = [w // 2, h // 2]
#             print(f"No prompt point provided. Using center: {prompt_point}")

#         print(f"Processing segmentation for point: {prompt_point} on {w}x{h} image")
        
#         # SAM requires input_labels (1 for positive, 0 for negative)
#         inputs = sam_processor(
#             image, 
#             input_points=[[prompt_point]], 
#             input_labels=[[1]], 
#             return_tensors="pt"
#         )
    
#         # Move inputs to GPU if model is on GPU
#         if torch.cuda.is_available():
#             inputs = {k: v.to("cuda") for k, v in inputs.items()}

#         with torch.no_grad():
#             outputs = sam_model(**inputs)

#         # Post-process the masks - Move this OUTSIDE the 'with Image.open' but keep the 'outputs'
#         processed_masks_list = sam_processor.image_processor.post_process_masks(
#             outputs.pred_masks.cpu(),
#             inputs["original_sizes"].cpu(),
#             inputs["reshaped_input_sizes"].cpu()
#         )
        
#         if not processed_masks_list:
#             print("SAM returned no masks at all.")
#             return None
            
#         masks = processed_masks_list[0] # Get the first (and only) image's masks
#         binary_masks = masks.cpu().numpy() # Convert to numpy for processing
#         print(f"Model returned {len(masks)} potential masks.")

#     # --- Improved Mask Selection Logic ---
#     # SAM typically returns 3 masks for a point prompt:
#     # Index 0: Sub-part (e.g., a shadow, a decor item on wall)
#     # Index 1: Part (e.g., the wall itself)
#     # Index 2: Whole (e.g., the entire room or wall+ceiling)
    
#     if prompt_point and binary_masks is not None and len(binary_masks) > 0:
#         px, py = prompt_point
#         print(f"Selecting best mask for point [{px}, {py}] from {len(binary_masks)} candidates")
        
#         valid_candidates = []
        
#         for idx, mask_arr in enumerate(binary_masks):
#             # Ensure 2D
#             if mask_arr.ndim != 2: continue
            
#             h, w = mask_arr.shape
#             # Basic validation: point must be inside
#             if 0 <= py < h and 0 <= px < w and mask_arr[py, px]:
#                 area = np.sum(mask_arr)
#                 total_pixels = h * w
#                 coverage = area / total_pixels
                
#                 print(f"  Mask {idx}: Coverage {coverage:.2%}")
                
#                 # Heuristic filters:
#                 # 1. Too tiny? (< 0.5%) -> Likely noise or a light switch.
#                 # 2. Too huge? (> 90%) -> Likely the whole image/room.
#                 if coverage < 0.005:
#                     print(f"  -> Reject {idx}: Too small")
#                     continue
#                 if coverage > 0.90:
#                     print(f"  -> Reject {idx}: Too large (appears to be whole image)")
#                     continue
                    
#                 valid_candidates.append({
#                     'index': idx,
#                     'mask': mask_arr,
#                     'coverage': coverage
#                 })
        
#         target_mask = None
        
#         if valid_candidates:
#             # Sort by coverage (Smallest to Largest)
#             valid_candidates.sort(key=lambda x: x['coverage'])
            
#             print(f"  Found {len(valid_candidates)} valid candidates.")
            
#             # Strategy: Prefer larger masks that represent walls
#             if len(valid_candidates) == 1:
#                 target_mask = valid_candidates[0]['mask']
#                 print(f"  -> Selected single valid candidate (Index {valid_candidates[0]['index']})")
#             else:
#                 # If we have multiple candidates, we want a significant wall section.
#                 # Often the largest valid mask is the best bet for a wall,
#                 # unless it's suspiciously close to the whole image size or significantly larger than the next best.
                
#                 # Heuristic: Avoid "Whole Room" masks (wall+ceiling+floor)
#                 # 1. Reject purely based on massive coverage (> 75%) if a reasonable alternative exists.
#                 # 2. Reject if it touches all 4 image borders (likely the entire viewport).
                
#                 filtered_candidates = []
#                 for cand in valid_candidates:
#                     mask = cand['mask']
#                     h, w = mask.shape
#                     # Check borders: Top, Bottom, Left, Right
#                     touches_all_borders = (mask[0,:].any() and mask[h-1,:].any() and mask[:,0].any() and mask[:,w-1].any())
#                     cand['touches_borders'] = touches_all_borders
#                     filtered_candidates.append(cand)
                
#                 # Sort by coverage descending
#                 filtered_candidates.sort(key=lambda x: x['coverage'], reverse=True)
                
#                 largest = filtered_candidates[0]
#                 target_cand = largest
                
#                 if len(filtered_candidates) > 1:
#                     second = filtered_candidates[1]
                    
#                     # Logic 1: If largest is huge (> 75%) and second is decent (> 5%), pick second.
#                     if largest['coverage'] > 0.75 and second['coverage'] > 0.05:
#                         print(f"  -> Rejecting largest (Cov: {largest['coverage']:.2%}) because it's too big (likely whole room). Exploring index {second['index']}.")
#                         target_cand = second
                        
#                     # Logic 2: If largest touches all 4 borders and second doesn't (and is decent size), pick second.
#                     elif largest['touches_borders'] and not second.get('touches_borders', False) and second['coverage'] > 0.10:
#                         print(f"  -> Rejecting largest (Cov: {largest['coverage']:.2%}) because it touches all borders. Picking inner mask (Index {second['index']}).")
#                         target_cand = second
                
#                 print(f"  -> Final Selection: Index {target_cand['index']} (Coverage {target_cand['coverage']:.2%})")
#                 target_mask = target_cand['mask']
#         else:
#             print("  No valid point-containing masks found after filtering. Using lenient fallback.")
#             # Fallback: Trust SAM's generation and pick the "best" of the returned masks based on coverage.
#             # The point might have landed on a "hole" or "edge" pixel, but the mask is likely still valid.
            
#             fallback_candidates = []
#             for idx, mask_arr in enumerate(binary_masks):
#                 # Ensure 2D
#                 if mask_arr.ndim != 2: continue
                
#                 h, w = mask_arr.shape
#                 area = np.sum(mask_arr)
#                 coverage = area / (h * w)
                
#                 # Loose filters
#                 if coverage < 0.005: continue # Ignore tiny noise
#                 if coverage > 0.95: continue # Ignore whole image
                
#                 fallback_candidates.append({
#                      'index': idx,
#                      'mask': mask_arr,
#                      'coverage': coverage
#                 })
            
#             if fallback_candidates:
#                 # Pick the one with largest coverage that isn't infinite
#                 fallback_candidates.sort(key=lambda x: x['coverage'])
#                 target_mask = fallback_candidates[-1]['mask']
#                 print(f"  -> Fallback selection: Index {fallback_candidates[-1]['index']} (Coverage {fallback_candidates[-1]['coverage']:.2%})")
#             else:
#                  # If literally nothing is valid (or all filtered out), just take the largest one provided it's safe-ish
#                  # or just Index 1 which is usually the 'main' object
#                  idx = 1 if len(binary_masks) > 1 else 0
#                  target_mask = binary_masks[idx]
#                  if target_mask.ndim == 3:
#                      target_mask = target_mask.squeeze()
#                  print(f"  -> Desperation fallback: Selected Index {idx}")
            
#         if target_mask is not None:
#              # Post-process: Minimal cleanup
#              # Increasing kernel size to fill gaps in the paint
#              mask_uint8 = (target_mask * 255).astype(np.uint8)
             
#              # Ensure contiguous and 2D for OpenCV
#              if not mask_uint8.flags['C_CONTIGUOUS']:
#                  mask_uint8 = np.ascontiguousarray(mask_uint8)
             
#              if mask_uint8.ndim > 2:
#                  mask_uint8 = mask_uint8.squeeze()
                 
#              # Closing to fill small holes, Opening to remove loose noise
#              # Use larger kernel for closing to ensure paint "spreads" over breaks in continuity
#              kernel_close = np.ones((9, 9), np.uint8)
#              kernel_open = np.ones((5, 5), np.uint8) 
             
#              try:
#                  mask_cleaned = cv2.morphologyEx(mask_uint8, cv2.MORPH_CLOSE, kernel_close, iterations=2)
#                  mask_cleaned = cv2.morphologyEx(mask_cleaned, cv2.MORPH_OPEN, kernel_open, iterations=1)
#                  target_mask = mask_cleaned > 127
#                  print("  Applied properties morphological cleanup (v2: aggressive gap filling).")
#              except Exception as cv_err:
#                  print(f"  WARNING: OpenCV cleanup failed: {cv_err}. returning raw mask.")
#                  target_mask = mask_uint8 > 127
                 
#              return target_mask
#         else:
#              print("  FATAL: Could not find any mask for this point.")
#              return None

#     # Fallback if no prompt point (shouldn't happen with current frontend logic but good for safety)
#     valid_masks = [m for m in binary_masks if m.ndim == 2]
#     result = get_largest_mask(valid_masks)
#     return result


# @app.route('/segment', methods=['POST'])
# def segment_image():
#     print("Received segmentation request")
#     if request.method == 'OPTIONS':
#         # Preflight request, respond with 200 OK and appropriate headers
#         response = jsonify({})
#         response.headers.add("Access-Control-Allow-Origin", "*")
#         response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
#         response.headers.add("Access-Control-Allow-Methods", "POST,OPTIONS")
#         return response

#     if not request.json or 'image' not in request.json or 'mimeType' not in request.json:
#         print("Error: Invalid request body")
#         return jsonify({'error': 'Invalid request. Missing image or mimeType.'}), 400

#     image_data = request.json['image']
#     mime_type = request.json['mimeType']
#     prompt_point_raw = request.json.get('promptPoint') # Optional prompt point
    
#     # Normalize prompt_point to [x, y] list
#     prompt_point = None
#     if prompt_point_raw:
#         if isinstance(prompt_point_raw, dict):
#             prompt_point = [int(prompt_point_raw.get('x', 0)), int(prompt_point_raw.get('y', 0))]
#         elif isinstance(prompt_point_raw, list) and len(prompt_point_raw) >= 2:
#             prompt_point = [int(prompt_point_raw[0]), int(prompt_point_raw[1])]
    
#     # Decode base64 image
#     try:
#         header, encoded = image_data.split(",", 1) if "," in image_data else ("", image_data)
#         img_bytes = base64.b64decode(encoded)
#     except Exception as e:
#         print(f"Error decoding base64 image: {e}")
#         return jsonify({'error': f'Failed to decode image data: {e}'}), 400

#     # Save to a temporary file with a unique name to avoid race conditions
#     import uuid
#     request_id = str(uuid.uuid4())
#     temp_img_path = f"temp_{request_id}.{mime_type.split('/')[-1]}"
    
#     try:
#         with open(temp_img_path, "wb") as f:
#             f.write(img_bytes)
#     except Exception as e:
#         return jsonify({'error': f'Failed to write temporary image: {e}'}), 500

#     # Process image with SAM
#     try:
#         if sam_model is None or sam_processor is None:
#             return jsonify({'error': 'AI segmentation model is not loaded or initialized.'}), 500
        
#         wall_mask = process_image_for_walls(temp_img_path, prompt_point)

#         if wall_mask is None:
#             return jsonify({'error': 'Could not detect a suitable wall segment.'}), 404
        
#         # Convert the binary mask (numpy array) to Base64 for efficient transfer
#         # 0s and 255s.
#         mask_uint8 = (wall_mask * 255).astype(np.uint8)
        
#         # Ensure contiguous (just in case)
#         if not mask_uint8.flags['C_CONTIGUOUS']:
#             mask_uint8 = np.ascontiguousarray(mask_uint8)
            
#         flattened_bytes = mask_uint8.flatten().tobytes()
#         mask_b64 = base64.b64encode(flattened_bytes).decode('utf-8')
        
#         return jsonify({'mask_base64': mask_b64, 'width': wall_mask.shape[1], 'height': wall_mask.shape[0]}), 200

#     except Exception as e:
#         print(f"Error during image segmentation: {e}")
#         return jsonify({'error': f'Failed to process image for segmentation: {e}'}), 500
#     finally:
#         # Clean up temporary file - wrap in try-except for Windows file lock issues
#         try:
#             if os.path.exists(temp_img_path):
#                 os.remove(temp_img_path)
#                 print(f"Cleaned up temporary file: {temp_img_path}")
#         except Exception as cleanup_error:
#             print(f"Non-critical error during cleanup: {cleanup_error}")

# @app.errorhandler(Exception)
# def handle_exception(e):
#     # Log the full error
#     print(f"CRITICAL LOG: Unhandled exception: {e}")
#     import traceback
#     traceback.print_exc()
#     return jsonify({"error": str(e)}), 500

# if __name__ == '__main__':
#     # Flask runs on 5000 by default, ensure it doesn't conflict with Next.js (3000)
#     # Disable reloader because it can cause the model to be loaded twice on some systems
#     print( "Segmentation API starting on http://localhost:5000")
#     try:
#         app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)
#     except Exception as e:
#         import traceback
#         with open("crash_log.txt", "w") as f:
#             f.write(traceback.format_exc())
#         print("CRASHED:", e)
#         traceback.print_exc()


# import os
# print("Starting segmentation_api.py...", flush=True)
# import torch
# import numpy as np
# from PIL import Image
# import base64
# from flask import Flask, request, jsonify
# from flask_cors import CORS
# from transformers import SamModel, SamProcessor
# import cv2

# app = Flask(__name__)
# CORS(app)

# model_id = "facebook/sam-vit-base"
# sam_processor = None
# sam_model = None

# try:
#     print(f"Loading SAM processor and model: {model_id}")
#     sam_processor = SamProcessor.from_pretrained(model_id)
#     sam_model = SamModel.from_pretrained(model_id)
#     print("SAM model loaded successfully.")
#     if torch.cuda.is_available():
#         sam_model.to("cuda")
#         print("SAM model moved to GPU.")
#     else:
#         print("CUDA not available. SAM model running on CPU.")
# except Exception as e:
#     print(f"Error loading SAM model: {e}")
#     sam_processor = None
#     sam_model = None


# def flood_fill_connected_region(mask: np.ndarray, seed_x: int, seed_y: int) -> np.ndarray:
#     """
#     KEY FIX: Given a binary mask and a seed point (where user clicked),
#     return ONLY the connected region that contains the seed point.
#     This prevents paint from jumping across the room to other walls.
#     """
#     h, w = mask.shape
#     if not (0 <= seed_y < h and 0 <= seed_x < w):
#         return mask
#     if not mask[seed_y, seed_x]:
#         return mask  # seed not in mask — return original

#     # Use OpenCV connected components to isolate only the clicked region
#     mask_uint8 = (mask * 255).astype(np.uint8)

#     # Label all connected components
#     num_labels, labels = cv2.connectedComponents(mask_uint8, connectivity=8)

#     # Find which label the seed point belongs to
#     seed_label = labels[seed_y, seed_x]

#     if seed_label == 0:
#         # Seed is in background — return original mask
#         return mask

#     # Return ONLY the component containing the seed point
#     isolated = (labels == seed_label).astype(bool)
#     print(f"  ConnectedComponents: {num_labels - 1} regions found. Isolated label {seed_label}.")
#     return isolated


# def get_window_negative_points(image_width: int, image_height: int, prompt_point: list):
#     """Negative SAM points to discourage including windows/curtains."""
#     negative_points = []
#     px, py = prompt_point
#     margin = 0.08

#     candidates = [
#         [int(image_width * margin), int(image_height * margin)],
#         [int(image_width * (1 - margin)), int(image_height * margin)],
#         [int(image_width * margin), int(image_height * 0.5)],
#         [int(image_width * (1 - margin)), int(image_height * 0.5)],
#     ]

#     min_dist = min(image_width, image_height) * 0.15
#     for cp in candidates:
#         dist = ((cp[0] - px) ** 2 + (cp[1] - py) ** 2) ** 0.5
#         if dist > min_dist:
#             negative_points.append(cp)

#     return negative_points


# def process_image_for_walls(image_path: str, prompt_point: list = None):
#     if sam_model is None or sam_processor is None:
#         print("SAM model not loaded.")
#         return None

#     with Image.open(image_path) as img:
#         image = img.convert("RGB")
#         w, h = image.size

#         if prompt_point is None:
#             prompt_point = [w // 2, h // 2]
#             print(f"No prompt point. Using center: {prompt_point}")

#         print(f"Processing segmentation for point: {prompt_point} on {w}x{h} image")

#         # Build negative points to exclude windows/curtains
#         neg_points = get_window_negative_points(w, h, prompt_point)
#         all_points = [prompt_point] + neg_points
#         all_labels = [1] + [0] * len(neg_points)
#         print(f"Using {len(neg_points)} negative points to exclude windows")

#         inputs = sam_processor(
#             image,
#             input_points=[all_points],
#             input_labels=[all_labels],
#             return_tensors="pt"
#         )

#     if torch.cuda.is_available():
#         inputs = {k: v.to("cuda") for k, v in inputs.items()}

#     with torch.no_grad():
#         outputs = sam_model(**inputs)

#     processed_masks_list = sam_processor.image_processor.post_process_masks(
#         outputs.pred_masks.cpu(),
#         inputs["original_sizes"].cpu(),
#         inputs["reshaped_input_sizes"].cpu()
#     )

#     if not processed_masks_list:
#         print("SAM returned no masks.")
#         return None

#     masks = processed_masks_list[0]
#     binary_masks = masks.cpu().numpy()
#     print(f"Model returned {len(masks)} potential masks.")

#     px, py = prompt_point
#     valid_candidates = []

#     for idx, mask_arr in enumerate(binary_masks):
#         if mask_arr.ndim != 2:
#             continue

#         mh, mw = mask_arr.shape
#         if not (0 <= py < mh and 0 <= px < mw):
#             continue

#         # ── KEY FIX STEP 1: isolate only the connected region at click point ──
#         isolated = flood_fill_connected_region(mask_arr, px, py)

#         area = np.sum(isolated)
#         total_pixels = mh * mw
#         coverage = area / total_pixels

#         print(f"  Mask {idx}: Raw coverage {np.sum(mask_arr)/total_pixels:.2%} → Isolated coverage {coverage:.2%}")

#         # Must contain the seed point after isolation
#         if not isolated[py, px]:
#             print(f"  -> Reject {idx}: seed not in isolated region")
#             continue

#         # Filter out noise and whole-room masks
#         if coverage < 0.005:
#             print(f"  -> Reject {idx}: too small ({coverage:.2%})")
#             continue
#         if coverage > 0.80:
#             print(f"  -> Reject {idx}: too large — likely whole room ({coverage:.2%})")
#             continue

#         valid_candidates.append({
#             'index': idx,
#             'mask': isolated,   # use the ISOLATED region, not the full SAM mask
#             'coverage': coverage
#         })

#     target_mask = None

#     if valid_candidates:
#         # Sort by coverage descending — prefer larger wall regions
#         valid_candidates.sort(key=lambda x: x['coverage'], reverse=True)

#         # ── KEY FIX STEP 2: among valid, prefer masks 5–60% coverage (single wall) ──
#         wall_sized = [c for c in valid_candidates if 0.05 <= c['coverage'] <= 0.60]

#         if wall_sized:
#             target_mask = wall_sized[0]['mask']
#             print(f"  -> Selected wall-sized mask (Index {wall_sized[0]['index']}, Coverage {wall_sized[0]['coverage']:.2%})")
#         else:
#             target_mask = valid_candidates[0]['mask']
#             print(f"  -> Fallback to largest valid (Index {valid_candidates[0]['index']}, Coverage {valid_candidates[0]['coverage']:.2%})")

#     else:
#         print("  No valid candidates. Using lenient fallback.")
#         # Lenient fallback — just pick smallest non-tiny mask and isolate it
#         fallback = []
#         for idx, mask_arr in enumerate(binary_masks):
#             if mask_arr.ndim != 2:
#                 continue
#             mh, mw = mask_arr.shape
#             coverage = np.sum(mask_arr) / (mh * mw)
#             if 0.005 < coverage < 0.95:
#                 isolated = flood_fill_connected_region(mask_arr, px, py)
#                 fallback.append({'index': idx, 'mask': isolated, 'coverage': np.sum(isolated) / (mh * mw)})

#         if fallback:
#             fallback.sort(key=lambda x: x['coverage'])
#             target_mask = fallback[-1]['mask']
#             print(f"  -> Fallback: Index {fallback[-1]['index']}")

#     if target_mask is None:
#         print("  FATAL: No mask found.")
#         return None

#     # Morphological cleanup — close small holes, remove noise
#     mask_uint8 = (target_mask * 255).astype(np.uint8)
#     if not mask_uint8.flags['C_CONTIGUOUS']:
#         mask_uint8 = np.ascontiguousarray(mask_uint8)
#     if mask_uint8.ndim > 2:
#         mask_uint8 = mask_uint8.squeeze()

#     kernel_close = np.ones((7, 7), np.uint8)
#     kernel_open = np.ones((3, 3), np.uint8)
#     try:
#         mask_cleaned = cv2.morphologyEx(mask_uint8, cv2.MORPH_CLOSE, kernel_close, iterations=2)
#         mask_cleaned = cv2.morphologyEx(mask_cleaned, cv2.MORPH_OPEN, kernel_open, iterations=1)
#         target_mask = mask_cleaned > 127
#         print("  Morphological cleanup applied.")
#     except Exception as cv_err:
#         print(f"  WARNING: OpenCV cleanup failed: {cv_err}")
#         target_mask = mask_uint8 > 127

#     return target_mask


# @app.route('/segment', methods=['POST'])
# def segment_image():
#     print("Received segmentation request")

#     if not request.json or 'image' not in request.json or 'mimeType' not in request.json:
#         return jsonify({'error': 'Invalid request. Missing image or mimeType.'}), 400

#     image_data = request.json['image']
#     mime_type = request.json['mimeType']
#     prompt_point_raw = request.json.get('promptPoint')

#     prompt_point = None
#     if prompt_point_raw:
#         if isinstance(prompt_point_raw, dict):
#             prompt_point = [int(prompt_point_raw.get('x', 0)), int(prompt_point_raw.get('y', 0))]
#         elif isinstance(prompt_point_raw, list) and len(prompt_point_raw) >= 2:
#             prompt_point = [int(prompt_point_raw[0]), int(prompt_point_raw[1])]

#     try:
#         header, encoded = image_data.split(",", 1) if "," in image_data else ("", image_data)
#         img_bytes = base64.b64decode(encoded)
#     except Exception as e:
#         return jsonify({'error': f'Failed to decode image: {e}'}), 400

#     import uuid
#     request_id = str(uuid.uuid4())
#     temp_img_path = f"temp_{request_id}.{mime_type.split('/')[-1]}"

#     try:
#         with open(temp_img_path, "wb") as f:
#             f.write(img_bytes)
#     except Exception as e:
#         return jsonify({'error': f'Failed to write temp image: {e}'}), 500

#     try:
#         if sam_model is None or sam_processor is None:
#             return jsonify({'error': 'SAM model not loaded.'}), 500

#         wall_mask = process_image_for_walls(temp_img_path, prompt_point)

#         if wall_mask is None:
#             return jsonify({'error': 'Could not detect a wall segment.'}), 404

#         mask_uint8 = (wall_mask * 255).astype(np.uint8)
#         if not mask_uint8.flags['C_CONTIGUOUS']:
#             mask_uint8 = np.ascontiguousarray(mask_uint8)

#         flattened_bytes = mask_uint8.flatten().tobytes()
#         mask_b64 = base64.b64encode(flattened_bytes).decode('utf-8')

#         return jsonify({
#             'mask_base64': mask_b64,
#             'width': wall_mask.shape[1],
#             'height': wall_mask.shape[0]
#         }), 200

#     except Exception as e:
#         print(f"Error during segmentation: {e}")
#         import traceback
#         traceback.print_exc()
#         return jsonify({'error': f'Segmentation failed: {e}'}), 500
#     finally:
#         try:
#             if os.path.exists(temp_img_path):
#                 os.remove(temp_img_path)
#         except Exception as cleanup_error:
#             print(f"Cleanup error (non-critical): {cleanup_error}")


# @app.errorhandler(Exception)
# def handle_exception(e):
#     print(f"Unhandled exception: {e}")
#     import traceback
#     traceback.print_exc()
#     return jsonify({"error": str(e)}), 500


# if __name__ == '__main__':
#     print("Segmentation API starting on http://localhost:5000")
#     try:
#         app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)
#     except Exception as e:
#         import traceback
#         with open("crash_log.txt", "w") as f:
#             f.write(traceback.format_exc())
#         print("CRASHED:", e)
#         traceback.print_exc()

import os
print("Starting segmentation_api.py...", flush=True)
import torch
import numpy as np
from PIL import Image
import base64
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import SamModel, SamProcessor
import cv2

app = Flask(__name__)
CORS(app)

model_id = "facebook/sam-vit-base"
sam_processor = None
sam_model = None

try:
    print(f"Loading SAM processor and model: {model_id}")
    sam_processor = SamProcessor.from_pretrained(model_id)
    sam_model = SamModel.from_pretrained(model_id)
    print("SAM model loaded successfully.")
    if torch.cuda.is_available():
        sam_model.to("cuda")
        print("SAM model moved to GPU.")
    else:
        print("CUDA not available. SAM model running on CPU.")
except Exception as e:
    print(f"Error loading SAM model: {e}")
    sam_processor = None
    sam_model = None


def flood_fill_connected_region(mask: np.ndarray, seed_x: int, seed_y: int) -> np.ndarray:
    """
    KEY FIX: Given a binary mask and a seed point (where user clicked),
    return ONLY the connected region that contains the seed point.
    This prevents paint from jumping across the room to other walls.
    """
    h, w = mask.shape
    if not (0 <= seed_y < h and 0 <= seed_x < w):
        return mask
    if not mask[seed_y, seed_x]:
        return mask  # seed not in mask — return original

    # Use OpenCV connected components to isolate only the clicked region
    mask_uint8 = (mask * 255).astype(np.uint8)

    # Label all connected components
    num_labels, labels = cv2.connectedComponents(mask_uint8, connectivity=8)

    # Find which label the seed point belongs to
    seed_label = labels[seed_y, seed_x]

    if seed_label == 0:
        # Seed is in background — return original mask
        return mask

    # Return ONLY the component containing the seed point
    isolated = (labels == seed_label).astype(bool)
    print(f"  ConnectedComponents: {num_labels - 1} regions found. Isolated label {seed_label}.")
    return isolated


def get_window_negative_points(image_width: int, image_height: int, prompt_point: list):
    """Negative SAM points to discourage including windows/curtains."""
    negative_points = []
    px, py = prompt_point
    margin = 0.08

    candidates = [
        [int(image_width * margin), int(image_height * margin)],
        [int(image_width * (1 - margin)), int(image_height * margin)],
        [int(image_width * margin), int(image_height * 0.5)],
        [int(image_width * (1 - margin)), int(image_height * 0.5)],
    ]

    min_dist = min(image_width, image_height) * 0.15
    for cp in candidates:
        dist = ((cp[0] - px) ** 2 + (cp[1] - py) ** 2) ** 0.5
        if dist > min_dist:
            negative_points.append(cp)

    return negative_points


def process_image_for_walls(image_path: str, prompt_point: list = None):
    if sam_model is None or sam_processor is None:
        print("SAM model not loaded.")
        return None

    with Image.open(image_path) as img:
        image = img.convert("RGB")
        w, h = image.size

        if prompt_point is None:
            prompt_point = [w // 2, h // 2]
            print(f"No prompt point. Using center: {prompt_point}")

        print(f"Processing segmentation for point: {prompt_point} on {w}x{h} image")

        # Single positive point only — multiple points reduce mask count from 3 to 1
        print(f"Using single positive point: {prompt_point}")
        inputs = sam_processor(
            image,
            input_points=[[prompt_point]],
            input_labels=[[1]],
            return_tensors="pt"
        )

    if torch.cuda.is_available():
        inputs = {k: v.to("cuda") for k, v in inputs.items()}

    with torch.no_grad():
        outputs = sam_model(**inputs)

    processed_masks_list = sam_processor.image_processor.post_process_masks(
        outputs.pred_masks.cpu(),
        inputs["original_sizes"].cpu(),
        inputs["reshaped_input_sizes"].cpu()
    )

    if not processed_masks_list:
        print("SAM returned no masks.")
        return None

    masks = processed_masks_list[0]
    binary_masks = masks.cpu().numpy()
    print(f"Model returned {len(masks)} potential masks.")

    px, py = prompt_point
    valid_candidates = []

    for idx, mask_arr in enumerate(binary_masks):
        if mask_arr.ndim != 2:
            continue

        mh, mw = mask_arr.shape
        if not (0 <= py < mh and 0 <= px < mw):
            continue

        # ── KEY FIX STEP 1: isolate only the connected region at click point ──
        isolated = flood_fill_connected_region(mask_arr, px, py)

        area = np.sum(isolated)
        total_pixels = mh * mw
        coverage = area / total_pixels

        print(f"  Mask {idx}: Raw coverage {np.sum(mask_arr)/total_pixels:.2%} → Isolated coverage {coverage:.2%}")

        # Filter out only extreme noise — be very lenient
        if coverage < 0.001:
            print(f"  -> Reject {idx}: too small ({coverage:.2%})")
            continue
        if coverage > 0.92:
            print(f"  -> Reject {idx}: too large — whole image ({coverage:.2%})")
            continue

        # If isolated region doesn't contain seed, fall back to raw mask isolated differently
        if not isolated[py, px]:
            print(f"  -> Mask {idx}: seed not in isolated region, trying raw mask")
            # Use the raw mask directly but still record it as lower priority
            isolated = mask_arr.astype(bool)
            coverage = np.sum(isolated) / total_pixels
            if coverage > 0.92:
                continue

        valid_candidates.append({
            'index': idx,
            'mask': isolated,
            'coverage': coverage,
            'seed_inside': bool(isolated[py, px]) if (0 <= py < isolated.shape[0] and 0 <= px < isolated.shape[1]) else False
        })

    target_mask = None

    if valid_candidates:
        # Prioritise masks where seed is confirmed inside
        seed_inside = [c for c in valid_candidates if c.get('seed_inside', False)]
        pool = seed_inside if seed_inside else valid_candidates

        # Sort by coverage descending
        pool.sort(key=lambda x: x['coverage'], reverse=True)

        # Prefer single-wall sized masks (3% – 75% of image)
        wall_sized = [c for c in pool if 0.03 <= c['coverage'] <= 0.75]

        if wall_sized:
            target_mask = wall_sized[0]['mask']
            print(f"  -> Selected (Index {wall_sized[0]['index']}, Coverage {wall_sized[0]['coverage']:.2%})")
        else:
            target_mask = pool[0]['mask']
            print(f"  -> Fallback to best available (Index {pool[0]['index']}, Coverage {pool[0]['coverage']:.2%})")

    else:
        print("  No valid candidates — using emergency fallback (raw SAM mask 1).")
        # Emergency: just take SAM's middle mask (index 1 = "part" level, usually the wall)
        for try_idx in [1, 0, 2]:
            if try_idx < len(binary_masks):
                m = binary_masks[try_idx]
                if m.ndim == 2:
                    isolated = flood_fill_connected_region(m, px, py)
                    cov = np.sum(isolated) / (m.shape[0] * m.shape[1])
                    if cov > 0.001:
                        target_mask = isolated
                        print(f"  -> Emergency fallback mask {try_idx} (Coverage {cov:.2%})")
                        break

    if target_mask is None:
        print("  FATAL: No mask found via normal path. Using nuclear fallback.")
        for try_idx in [1, 0, 2]:
            if try_idx < len(binary_masks):
                m = binary_masks[try_idx]
                if m.ndim == 2 and np.sum(m) > 0:
                    target_mask = m.astype(bool)
                    print(f"  -> Nuclear fallback: raw mask {try_idx} (Coverage {np.sum(target_mask)/(m.shape[0]*m.shape[1]):.2%})")
                    break

    if target_mask is None:
        print("  ABSOLUTE FATAL: SAM returned zero usable masks.")
        return None

    # Morphological cleanup — close small holes, remove noise
    mask_uint8 = (target_mask * 255).astype(np.uint8)
    if not mask_uint8.flags['C_CONTIGUOUS']:
        mask_uint8 = np.ascontiguousarray(mask_uint8)
    if mask_uint8.ndim > 2:
        mask_uint8 = mask_uint8.squeeze()

    kernel_close = np.ones((7, 7), np.uint8)
    kernel_open = np.ones((3, 3), np.uint8)
    try:
        mask_cleaned = cv2.morphologyEx(mask_uint8, cv2.MORPH_CLOSE, kernel_close, iterations=2)
        mask_cleaned = cv2.morphologyEx(mask_cleaned, cv2.MORPH_OPEN, kernel_open, iterations=1)
        target_mask = mask_cleaned > 127
        print("  Morphological cleanup applied.")
    except Exception as cv_err:
        print(f"  WARNING: OpenCV cleanup failed: {cv_err}")
        target_mask = mask_uint8 > 127

    return target_mask


@app.route('/segment', methods=['POST'])
def segment_image():
    print("Received segmentation request")

    if not request.json or 'image' not in request.json or 'mimeType' not in request.json:
        return jsonify({'error': 'Invalid request. Missing image or mimeType.'}), 400

    image_data = request.json['image']
    mime_type = request.json['mimeType']
    prompt_point_raw = request.json.get('promptPoint')

    prompt_point = None
    if prompt_point_raw:
        if isinstance(prompt_point_raw, dict):
            prompt_point = [int(prompt_point_raw.get('x', 0)), int(prompt_point_raw.get('y', 0))]
        elif isinstance(prompt_point_raw, list) and len(prompt_point_raw) >= 2:
            prompt_point = [int(prompt_point_raw[0]), int(prompt_point_raw[1])]

    try:
        header, encoded = image_data.split(",", 1) if "," in image_data else ("", image_data)
        img_bytes = base64.b64decode(encoded)
    except Exception as e:
        return jsonify({'error': f'Failed to decode image: {e}'}), 400

    import uuid
    request_id = str(uuid.uuid4())
    temp_img_path = f"temp_{request_id}.{mime_type.split('/')[-1]}"

    try:
        with open(temp_img_path, "wb") as f:
            f.write(img_bytes)
    except Exception as e:
        return jsonify({'error': f'Failed to write temp image: {e}'}), 500

    try:
        if sam_model is None or sam_processor is None:
            return jsonify({'error': 'SAM model not loaded.'}), 500

        wall_mask = process_image_for_walls(temp_img_path, prompt_point)

        if wall_mask is None:
            return jsonify({'error': 'Could not detect a wall segment.'}), 404

        mask_uint8 = (wall_mask * 255).astype(np.uint8)
        if not mask_uint8.flags['C_CONTIGUOUS']:
            mask_uint8 = np.ascontiguousarray(mask_uint8)

        flattened_bytes = mask_uint8.flatten().tobytes()
        mask_b64 = base64.b64encode(flattened_bytes).decode('utf-8')

        return jsonify({
            'mask_base64': mask_b64,
            'width': wall_mask.shape[1],
            'height': wall_mask.shape[0]
        }), 200

    except Exception as e:
        print(f"Error during segmentation: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Segmentation failed: {e}'}), 500
    finally:
        try:
            if os.path.exists(temp_img_path):
                os.remove(temp_img_path)
        except Exception as cleanup_error:
            print(f"Cleanup error (non-critical): {cleanup_error}")


@app.errorhandler(Exception)
def handle_exception(e):
    print(f"Unhandled exception: {e}")
    import traceback
    traceback.print_exc()
    return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print("Segmentation API starting on http://localhost:5000")
    try:
        app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)
    except Exception as e:
        import traceback
        with open("crash_log.txt", "w") as f:
            f.write(traceback.format_exc())
        print("CRASHED:", e)
        traceback.print_exc()