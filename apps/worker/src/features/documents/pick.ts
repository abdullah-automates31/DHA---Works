import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { IMAGE_QUALITY, fitWithin } from './files';

// Native side of W03: picking a file and getting bytes ready to upload. Nothing here logs file names, paths or
// contents. Images are always re-encoded as JPEG (HEIC from the iPhone becomes JPEG) at most 1600 px on the
// longest side; re-encoding also drops the photo's embedded location data.

export type PickedFile = { bytes: ArrayBuffer; mime: string };
export type PickResult =
  | { status: 'ok'; file: PickedFile }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'error' };

async function readBytes(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

async function prepareImage(uri: string, width: number, height: number): Promise<PickedFile> {
  let context = ImageManipulator.ImageManipulator.manipulate(uri);
  const fit = fitWithin(width, height);
  if (fit) context = context.resize(fit);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: IMAGE_QUALITY });
  return { bytes: await readBytes(saved.uri), mime: 'image/jpeg' };
}

export async function pickImage(source: 'camera' | 'library', options: { square?: boolean } = {}): Promise<PickResult> {
  try {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return { status: 'denied' };
    }
    const launch = source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await launch({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: options.square === true,
      aspect: options.square ? [1, 1] : undefined,
      exif: false,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return { status: 'cancelled' };
    return { status: 'ok', file: await prepareImage(asset.uri, asset.width, asset.height) };
  } catch {
    return { status: 'error' };
  }
}

export async function pickPdf(): Promise<PickResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return { status: 'cancelled' };
    return { status: 'ok', file: { bytes: await readBytes(asset.uri), mime: asset.mimeType ?? 'application/pdf' } };
  } catch {
    return { status: 'error' };
  }
}
