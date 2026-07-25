import urllib.request
import zipfile

urllib.request.urlretrieve("https://archive.ics.uci.edu/ml/machine-learning-databases/00320/student.zip", "data/student.zip")

z = zipfile.ZipFile("data/student.zip")
z.extractall("data/")
z.close()

print("Dataset downloaded successfully")