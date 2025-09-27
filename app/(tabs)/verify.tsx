import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { BarcodeScanningResult } from 'expo-camera';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
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

import { useOfflineCache } from '@/context/OfflineCacheContext';
import { useVerificationHistory } from '@/context/VerificationHistoryContext';
import {
  CredentialFormat,
  CredentialsVerifier,
  VerificationResult,
  decodeQrData,
} from '@mosip/react-inji-verify-sdk';

const RESULT_LIMIT = 20;
const ERROR_CODE_OFFLINE_DEPENDENCIES_MISSING = 'ERR_OFFLINE_DEPENDENCIES_MISSING';
const ERROR_CODE_SIGNATURE_VERIFICATION_FAILED = 'ERR_SIGNATURE_VERIFICATION_FAILED';

type ExtendedResult = VerificationResult & {
  source: 'scan' | 'image';
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
  const { history, addResult, clearHistory } = useVerificationHistory();
  const { refreshSdkSnapshot } = useOfflineCache();
  const router = useRouter();

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [isScannerVisible, setScannerVisible] = useState(false);
  const [isVerifying, setVerifying] = useState(false);
  const [verificationModal, setVerificationModal] = useState<{
    visible: boolean;
    result: ExtendedResult | null;
  }>({ visible: false, result: null });
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
        '📱 Camera Unavailable',
        'Live QR scanning is not supported in this environment.',
        [{ text: 'OK', style: 'default' }],
        { cancelable: true }
      );
      return false;
    }

    const result = await requestCameraPermission();
    if (result?.granted) {
      return true;
    }

    Alert.alert(
      '📹 Camera Permission Required', 
      'Grant camera access to scan QR codes.',
      [{ text: 'OK', style: 'default' }],
      { cancelable: true }
    );
    return false;
  };



  const verifyPayload = async (rawPayload: string) => {
    setVerifying(true);

    let processed: unknown = rawPayload;
    let stringifiedPayload = rawPayload;
    let parsedObject: any = null;

    try {
      try {
        const decoded = await decodeQrData(rawPayload);
        processed = decoded;
      } catch {
        processed = rawPayload;
      }

      if (typeof processed === 'string') {
        stringifiedPayload = processed;
      } else {
        stringifiedPayload = JSON.stringify(processed);
      }

      try {
        parsedObject = typeof processed === 'string' ? JSON.parse(processed) : processed;
      } catch {
        parsedObject = null;
      }

      const verifier = new CredentialsVerifier();
      const verification = await verifier.verify(stringifiedPayload, CredentialFormat.LDP_VC);
      const source: ExtendedResult['source'] = 'scan';
      const enriched: ExtendedResult = {
        ...verification,
        source,
        timestamp: Date.now(),
        raw: stringifiedPayload,
      };
      if (!(enriched as any).payload && parsedObject) {
        (enriched as any).payload = parsedObject;
      }

      setVerificationModal({ visible: true, result: enriched });
      await addResult(enriched, { source, raw: stringifiedPayload });
      await refreshSdkSnapshot().catch(() => undefined);
    } catch (error: any) {
      const errorMessage = (error?.message ?? '').toString();
      if (errorMessage.includes(ERROR_CODE_OFFLINE_DEPENDENCIES_MISSING)) {
        const fallback = new VerificationResult(
          false,
          'Required verification data not available offline. Connect to the internet to seed the cache and try again.',
          ERROR_CODE_OFFLINE_DEPENDENCIES_MISSING
        );
        const source: ExtendedResult['source'] = 'scan';
        const enriched: ExtendedResult = {
          ...fallback,
          source,
          timestamp: Date.now(),
          raw: stringifiedPayload,
        };
        if (!(enriched as any).payload && parsedObject) {
          (enriched as any).payload = parsedObject;
        }
        setVerificationModal({ visible: true, result: enriched });
        await addResult(enriched, { source, raw: stringifiedPayload });
        await refreshSdkSnapshot().catch(() => undefined);
        return;
      }

      // For unknown errors, create a failure result to show in modal
      const errorResult: ExtendedResult = {
        verificationStatus: false,
        verificationMessage: errorMessage || 'An unknown error occurred during verification.',
        verificationErrorCode: 'UNKNOWN_ERROR',
        payload: null,
        source: 'scan',
        timestamp: Date.now(),
        raw: stringifiedPayload,
      };
      setVerificationModal({ visible: true, result: errorResult });
    } finally {
      setVerifying(false);
    }
  };

  const handleBarCodeScanned = async (result: BarcodeScanningResult) => {
    if (scanLockRef.current) return;

    const data = result?.data?.trim();
    if (!data) {
      Alert.alert(
        '📷 Scan Failed', 
        'No QR data detected. Please try again.',
        [{ text: 'OK', style: 'default' }],
        { cancelable: true }
      );
      return;
    }

    scanLockRef.current = true;
    setScannerVisible(false);

    try {
      await verifyPayload(data);
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

  const getVerificationModalConfig = (result: ExtendedResult) => {
    const status = result.verificationStatus;
    const isExpired =
      result.verificationErrorCode === 'VC_EXPIRED' ||
      result.verificationErrorCode === 'EXPIRED' ||
      result.verificationErrorCode === 'ERR_VC_EXPIRED';

    if (status && !isExpired) {
      return {
        title: 'Verification Successful',
        backgroundColor: '#ecfdf5',
        borderColor: '#10b981',
        titleColor: '#065f46'
      };
    } else if (status && isExpired) {
      return {
        title: 'Credential Expired',
        backgroundColor: '#fffbeb',
        borderColor: '#f59e0b',
        titleColor: '#92400e'
      };
    } else {
      return {
        title: 'Verification Failed',
        backgroundColor: '#fef2f2',
        borderColor: '#ef4444',
        titleColor: '#991b1b'
      };
    }
  };

  const renderVerificationModal = () => {
    if (!verificationModal.visible || !verificationModal.result) return null;

    const result = verificationModal.result;
    const config = getVerificationModalConfig(result);
    const isExpired =
      result.verificationErrorCode === 'VC_EXPIRED' ||
      result.verificationErrorCode === 'EXPIRED';
    const statusText = result.verificationStatus 
      ? (isExpired ? 'Signature valid but credential has expired' : 'Credential is valid and verified') 
      : 'Verification failed';

    return (
      <Modal
        visible={verificationModal.visible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setVerificationModal({ visible: false, result: null })}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { 
            backgroundColor: config.backgroundColor, 
            borderColor: config.borderColor 
          }]}>
            <Text style={[styles.modalTitle, { color: config.titleColor }]}>
              {config.title}
            </Text>
            <Text style={styles.modalMessage}>{statusText}</Text>
            
            {result.verificationMessage && (
              <Text style={styles.modalDetailMessage}>
                {result.verificationMessage}
              </Text>
            )}
            
            {result.verificationErrorCode && (
              <Text style={styles.modalErrorCode}>
                Error Code: {result.verificationErrorCode}
              </Text>
            )}
            
            <View style={styles.modalMetaRow}>
              <Text style={styles.modalMeta}>Source: {result.source}</Text>
              <Text style={styles.modalMeta}>{new Date(result.timestamp).toLocaleString()}</Text>
            </View>
            
            <Pressable
              style={[styles.modalCloseButton, { backgroundColor: config.borderColor }]}
              onPress={() => setVerificationModal({ visible: false, result: null })}
              accessibilityRole="button"
            >
              <Text style={styles.modalCloseButtonText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  };

  const renderHistoryItem = ({ item }: { item: typeof latestHistory[number] }) => (
    <View style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <View
          style={[
            styles.statusDot,
            item.verificationStatus ? styles.statusSuccess : styles.statusFailure,
          ]}
        />
        <Text style={styles.historyTitle}>
          {item.verificationStatus ? 'Verified' : 'Failed'} •{' '}
          {new Date(item.timestamp).toLocaleTimeString()}
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
          Scan a QR code. The verifier uses cached keys and contexts so everything works even when
          you’re offline.
        </Text>

        <View style={styles.buttonRow}>
          <Pressable
            style={styles.primaryButton}
            onPress={handleScanPress}
            accessibilityRole="button"
          >
            <Ionicons name="scan-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>Scan QR</Text>
          </Pressable>
        </View>

        {isVerifying ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}

        <View style={styles.historyHeaderRow}>
          <Text style={styles.subHeading}>Recent Verifications</Text>
          <Pressable onPress={() => clearHistory()} accessibilityRole="button">
            <Text style={styles.clearHistoryText}>Clear</Text>
          </Pressable>
        </View>
        {latestHistory.length === 0 ? (
          <Text style={styles.emptyState}>No verifications yet.</Text>
        ) : (
          <View style={styles.historyContainer}>
            <FlatList
              data={latestHistory}
              keyExtractor={(item) => item.id}
              renderItem={renderHistoryItem}
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              scrollEnabled={true}
              showsVerticalScrollIndicator={true}
              style={styles.historyList}
              contentContainerStyle={styles.historyListContent}
            />
          </View>
        )}
      </View>

      {renderVerificationModal()}

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
                  Grant camera permission or use a development build that supports camera access.
                </Text>
              </View>
            )}
          </View>
          <Pressable
            style={styles.closeScannerButton}
            onPress={() => setScannerVisible(false)}
            accessibilityRole="button"
          >
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
    gap: 16,
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
    justifyContent: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    shadowColor: '#4f46e5',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
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
    padding: 18,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
  historyContainer: {
    flex: 1,
    maxHeight: 400, // Limit height to make it scrollable
  },
  historyList: {
    flex: 1,
  },
  historyListContent: {
    paddingBottom: 16,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalDetailMessage: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalErrorCode: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  modalMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  modalMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  modalCloseButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
