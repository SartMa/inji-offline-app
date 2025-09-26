import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanningResult } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';

import {
  CredentialFormat,
  CredentialsVerifier,
  VerificationResult,
  decodeQrData,
} from '@mosip/react-inji-verify-sdk';

import { useVerificationHistory } from '@/context/VerificationHistoryContext';

const RESULT_LIMIT = 20;

type ExtendedResult = VerificationResult & {
  source: 'scan' | 'upload';
  timestamp: number;
  raw?: string;
};

type HistoryItemProps = {
  title: string;
  value?: string | null;
};

const HistoryItem = ({ title, value }: HistoryItemProps) => (
  <View style={styles.historyRow}>
    <Text style={styles.historyLabel}>{title}</Text>
    <Text style={styles.historyValue}>{value ?? '—'}</Text>
  </View>
);

export default function VerifyScreen() {
  const router = useRouter();
  const { history, addResult, clearHistory } = useVerificationHistory();

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [isScannerVisible, setScannerVisible] = useState(false);
  const [isVerifying, setVerifying] = useState(false);
  const [lastResult, setLastResult] = useState<ExtendedResult | null>(null);
  const scanLockRef = useRef(false);

  const latestHistory = useMemo(() => history.slice(0, RESULT_LIMIT), [history]);

  useFocusEffect(
    useCallback(() => {
      scanLockRef.current = false;
      return () => {
        scanLockRef.current = false;
        setScannerVisible(false);
      };
    }, [])
  );

  const ensureCameraPermission = async (): Promise<boolean> => {
    if (cameraPermission?.granted) {
      return true;
    }

    if (!requestCameraPermission) {
      Alert.alert(
        'Camera unavailable',
        'Live QR scanning is not supported in this environment. Upload a credential JSON instead.'
      );
      return false;
    }

    const result = await requestCameraPermission();
    if (result?.granted) {
      return true;
    }

    Alert.alert('Camera permission needed', 'Grant camera access to scan QR codes.');
    return false;
  };

  const getAssetLocalUri = (asset: DocumentPicker.DocumentPickerAsset) => {
    const possibleUri = (asset as { fileCopyUri?: string }).fileCopyUri;
    return possibleUri ?? asset.uri;
  };

  const verifyPayload = async (rawPayload: string, source: 'scan' | 'upload') => {
    try {
      setVerifying(true);

      let processed: any = rawPayload;
      try {
        const decoded = await decodeQrData(rawPayload);
        processed = decoded;
      } catch {
        // Fallback to the original payload (likely already JSON)
        processed = rawPayload;
      }

      const stringified = typeof processed === 'string' ? processed : JSON.stringify(processed);
      let parsedObject: any = null;
      try {
        parsedObject = typeof processed === 'string' ? JSON.parse(processed) : processed;
      } catch {
        parsedObject = null;
      }

      const verifier = new CredentialsVerifier();
      const verification = await verifier.verify(stringified, CredentialFormat.LDP_VC);
      const enriched: ExtendedResult = {
        ...verification,
        source,
        timestamp: Date.now(),
        raw: stringified,
      };
      if (!(enriched as any).payload && parsedObject) {
        (enriched as any).payload = parsedObject;
      }

      setLastResult(enriched);
      await addResult(enriched, { source, raw: stringified });
      Alert.alert('Verification complete', verification.verificationStatus ? 'Credential is valid.' : 'Credential could not be verified.');
    } catch (error: any) {
      Alert.alert('Verification failed', error?.message ?? 'Unknown error');
    } finally {
      setVerifying(false);
    }
  };

  const handleBarCodeScanned = async (result: BarcodeScanningResult) => {
    if (scanLockRef.current) return;

    const data = result?.data?.trim();
    if (!data) {
      Alert.alert('Scan failed', 'No QR data detected.');
      return;
    }

    scanLockRef.current = true;
    setScannerVisible(false);

    try {
      await verifyPayload(data, 'scan');
    } finally {
      scanLockRef.current = false;
    }
  };

  const handleScanPress = async () => {
    const granted = await ensureCameraPermission();
    if (granted) {
      scanLockRef.current = false;
      setScannerVisible(true);
    }
  };

  const handleUploadPress = async () => {
    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (pickerResult.canceled) return;
      const asset = pickerResult.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Import failed', 'Could not read the selected file.');
        return;
      }
      const localUri = getAssetLocalUri(asset);
      if (!localUri) {
        Alert.alert('Import failed', 'Unable to access the selected file.');
        return;
      }

      const content = await FileSystem.readAsStringAsync(localUri);
      await verifyPayload(content, 'upload');
    } catch (error: any) {
      Alert.alert('Import failed', error?.message ?? 'Unknown error');
    }
  };

  const renderResultCard = () => {
    if (!lastResult) return null;
    const status = lastResult.verificationStatus;
    const isExpired = lastResult.verificationErrorCode === 'VC_EXPIRED' || lastResult.verificationErrorCode === 'EXPIRED';
    const statusText = status ? (isExpired ? 'Expired (signature valid)' : 'Verified') : 'Failed';

    return (
      <View style={[styles.resultCard, status ? styles.resultSuccess : styles.resultFailure]}>
        <Text style={styles.resultTitle}>{statusText}</Text>
        {lastResult.verificationMessage ? (
          <Text style={styles.resultMessage}>{lastResult.verificationMessage}</Text>
        ) : null}
        {lastResult.verificationErrorCode ? (
          <Text style={styles.resultCode}>Code: {lastResult.verificationErrorCode}</Text>
        ) : null}
        <View style={styles.resultMetaRow}>
          <Text style={styles.resultMeta}>Source: {lastResult.source}</Text>
          <Text style={styles.resultMeta}>{new Date(lastResult.timestamp).toLocaleString()}</Text>
        </View>
      </View>
    );
  };

  const renderHistoryItem = ({ item }: { item: typeof latestHistory[number] }) => (
    <View style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <View style={[styles.statusDot, item.verificationStatus ? styles.statusSuccess : styles.statusFailure]} />
        <Text style={styles.historyTitle}>
          {item.verificationStatus ? 'Verified' : 'Failed'} • {new Date(item.timestamp).toLocaleTimeString()}
        </Text>
      </View>
      <HistoryItem title="Source" value={item.source} />
      <HistoryItem title="Message" value={item.verificationMessage} />
      <HistoryItem title="Error Code" value={item.verificationErrorCode} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.heading}>Verify Credential</Text>
        <Text style={styles.description}>
          Scan a QR code live or upload a credential JSON file. The verifier uses cached keys and contexts
          so everything works even when you’re offline.
        </Text>

        <View style={styles.buttonRow}>
          <Pressable style={[styles.primaryButton, { flex: 1 }]} onPress={handleScanPress} accessibilityRole="button">
            <Ionicons name="scan-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>Scan QR</Text>
          </Pressable>
          <Pressable style={[styles.secondaryButton, { flex: 1 }]} onPress={handleUploadPress} accessibilityRole="button">
            <Ionicons name="cloud-upload-outline" size={20} color="#4f46e5" style={{ marginRight: 8 }} />
            <Text style={styles.secondaryButtonText}>Upload JSON</Text>
          </Pressable>
        </View>

        {isVerifying ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}

        {renderResultCard()}

        <View style={styles.historyHeaderRow}>
          <Text style={styles.subHeading}>Recent Verifications</Text>
          <Pressable onPress={() => clearHistory()} accessibilityRole="button">
            <Text style={styles.clearHistoryText}>Clear</Text>
          </Pressable>
        </View>
        {latestHistory.length === 0 ? (
          <Text style={styles.emptyState}>No verifications yet.</Text>
        ) : (
          <FlatList
            data={latestHistory}
            keyExtractor={(item) => item.id}
            renderItem={renderHistoryItem}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            scrollEnabled={false}
          />
        )}

        <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityRole="button">
          <Ionicons name="arrow-back" size={18} color="#4f46e5" />
          <Text style={styles.backButtonText}>Back to Add Credential</Text>
        </Pressable>
      </View>

      <Modal visible={isScannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
        <SafeAreaView style={styles.scannerContainer}>
          <Text style={styles.scannerTitle}>Align the QR within the frame</Text>
          <View style={styles.scannerFrame}>
            {cameraPermission?.granted ? (
              <CameraView
                style={styles.scannerCamera}
                facing="back"
                onBarcodeScanned={handleBarCodeScanned}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              />
            ) : (
              <View style={styles.scannerUnavailable}>
                <Text style={styles.scannerUnavailableText}>
                  Grant camera permission or use a development build that supports camera access. You can always upload a credential JSON file instead.
                </Text>
              </View>
            )}
          </View>
          <Pressable style={styles.closeScannerButton} onPress={() => setScannerVisible(false)} accessibilityRole="button">
            <Text style={styles.closeScannerButtonText}>Close Scanner</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
    padding: 20,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#4b5563',
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 14,
  },
  secondaryButtonText: {
    color: '#4f46e5',
    fontWeight: '600',
    fontSize: 16,
  },
  resultCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  resultSuccess: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#34d399',
  },
  resultFailure: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#f87171',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    color: '#111827',
  },
  resultMessage: {
    fontSize: 14,
    color: '#1f2937',
    marginBottom: 4,
  },
  resultCode: {
    fontSize: 12,
    color: '#6b7280',
  },
  resultMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  resultMeta: {
    fontSize: 12,
    color: '#1f2937',
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  subHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  clearHistoryText: {
    color: '#4f46e5',
    fontWeight: '600',
  },
  emptyState: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginLeft: 8,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  historyLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  historyValue: {
    fontSize: 13,
    color: '#1f2937',
    textAlign: 'right',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusSuccess: {
    backgroundColor: '#10b981',
  },
  statusFailure: {
    backgroundColor: '#ef4444',
  },
  backButton: {
    marginTop: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backButtonText: {
    color: '#4f46e5',
    fontWeight: '600',
    fontSize: 14,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20,
  },
  scannerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  scannerFrame: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#22d3ee',
  },
  scannerCamera: {
    flex: 1,
  },
  scannerUnavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#111827',
  },
  scannerUnavailableText: {
    color: '#f9fafb',
    fontSize: 14,
    textAlign: 'center',
  },
  closeScannerButton: {
    marginTop: 20,
    backgroundColor: '#22c55e',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  closeScannerButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
