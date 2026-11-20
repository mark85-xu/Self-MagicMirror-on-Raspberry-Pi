from ultralytics import YOLO

model = YOLO("./models/yolo26n-face.pt")

results = model.predict(
    source=0,
    stream=True,
    imgsz=640,
    conf=0.5,
    device=0,
    show=True,
)

for result in results:
    pass