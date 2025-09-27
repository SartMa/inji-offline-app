import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useOfflineCache } from '@/context/OfflineCacheContext';

const MAX_INPUT_LENGTH = 20000;
const MAX_SNAPSHOT_PREVIEW = 5;

const EMPTY_LIST_PLACEHOLDER = [] as const;



export default function CredentialCacheScreen() {
  const router = useRouter();
  const {
    addCredentialFromJson,
    clearAll,
    loading,
    sdkSnapshot,
    refreshSdkSnapshot,
  } = useOfflineCache();

  const [jsonInput, setJsonInput] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const [isClearing, setClearing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshSdkSnapshot().catch(() => undefined);
    }, [refreshSdkSnapshot])
  );

  const hasSdkData = useMemo(() => {
    if (loading) return false;
    return (
      sdkSnapshot.contexts.length > 0 ||
      sdkSnapshot.publicKeys.length > 0 ||
      sdkSnapshot.revokedVCs.length > 0
    );
  }, [loading, sdkSnapshot.contexts.length, sdkSnapshot.publicKeys.length, sdkSnapshot.revokedVCs.length]);

  const canClearCache = hasSdkData;

  const handleAdd = async (payload?: string) => {
    try {
      const body = payload ?? jsonInput;
      if (!body.trim()) {
        Alert.alert(
          '📋 Nothing to Add', 
          'Please paste a credential JSON or import a file.',
          [{ text: 'OK', style: 'default' }],
          { cancelable: true }
        );
        return;
      }
      setSubmitting(true);
      await addCredentialFromJson(body);
      if (!payload) {
        setJsonInput('');
      }
    } catch (error: any) {
      Alert.alert(
        '❌ Caching Failed', 
        `Unable to cache credential: ${error?.message ?? 'Unknown error'}`,
        [{ text: 'OK', style: 'default' }],
        { cancelable: true }
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClearAll = () => {
    if (!canClearCache || isClearing) {
      return;
    }

    Alert.alert(
      '🗑️ Clear All Cached Data?',
      'This clears SDK keys, contexts, and revoked lists.\n\n⚠️ You\'ll need to seed them again before offline verification.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              setClearing(true);
              await clearAll();
              await refreshSdkSnapshot().catch(() => undefined);
            } catch (error: any) {
              Alert.alert(
                '❌ Clear Cache Failed', 
                error?.message ?? 'Unknown error occurred',
                [{ text: 'OK', style: 'default' }],
                { cancelable: true }
              );
            } finally {
              setClearing(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleImportFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain'],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert(
          '📄 Import Failed', 
          'Could not read the selected file. Please check the file format.',
          [{ text: 'OK', style: 'default' }],
          { cancelable: true }
        );
        return;
      }

      const content = await FileSystem.readAsStringAsync(asset.uri);
      await handleAdd(content);
    } catch (error: any) {
      Alert.alert(
        '📄 Import Failed', 
        error?.message ?? 'An unknown error occurred during import',
        [{ text: 'OK', style: 'default' }],
        { cancelable: true }
      );
    }
  };



  const destructiveButtonStyle = [
    styles.destructiveButton,
    (!canClearCache || isClearing) && styles.destructiveButtonDisabled,
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Add Credential</Text>
        <Text style={styles.description}>
          Paste the Verifiable Credential JSON provided by the issuer, or import it from a file. The
          credential will be cached locally so it can be verified completely offline.
        </Text>

        <Text style={styles.label}>Credential JSON</Text>
        <TextInput
          multiline
          value={jsonInput}
          onChangeText={(text) => text.length <= MAX_INPUT_LENGTH && setJsonInput(text)}
          placeholder="Paste credential JSON here"
          style={styles.textInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.charCountWrapper}>
          <Text style={styles.charCount}>{jsonInput.length} / {MAX_INPUT_LENGTH}</Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.primaryButton, { flex: 1, marginRight: 8 }]}
            onPress={() => handleAdd()}
            disabled={isSubmitting}
            accessibilityRole="button"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Cache Credential</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, { flex: 1, marginLeft: 8 }]}
            onPress={handleImportFile}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Import from File</Text>
          </Pressable>
        </View>

        <Text style={[styles.heading, { marginTop: 32 }]}>Cached Keys and Contexts</Text>
        {loading ? (
          <ActivityIndicator />
        ) : (
          <View style={styles.sdkSection}>
            <View style={styles.metricRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{sdkSnapshot.contexts.length}</Text>
                <Text style={styles.metricLabel}>Contexts</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{sdkSnapshot.publicKeys.length}</Text>
                <Text style={styles.metricLabel}>Public Keys</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{sdkSnapshot.revokedVCs.length}</Text>
                <Text style={styles.metricLabel}>Revoked</Text>
              </View>
            </View>

            {sdkSnapshot.contexts.length === 0 && sdkSnapshot.publicKeys.length === 0 ? (
              <Text style={styles.emptyState}>No contexts or keys cached yet.</Text>
            ) : (
              <View style={styles.cacheList}>
                {sdkSnapshot.contexts.slice(0, MAX_SNAPSHOT_PREVIEW).map((ctx) => (
                  <View key={`ctx-${ctx.url}`} style={styles.cacheListItem}>
                    <Ionicons name="link" size={16} color="#4f46e5" style={{ marginRight: 8 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cacheItemTitle}>{ctx.url}</Text>
                      <Text style={styles.cacheItemMeta}>
                        Cached {new Date(ctx.cachedAt).toLocaleString()} • {ctx.source ?? 'unknown source'}
                      </Text>
                    </View>
                  </View>
                ))}
                {sdkSnapshot.publicKeys.slice(0, MAX_SNAPSHOT_PREVIEW).map((key) => (
                  <View key={`key-${key.key_id}`} style={styles.cacheListItem}>
                    <Ionicons name="key" size={16} color="#22c55e" style={{ marginRight: 8 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cacheItemTitle}>{key.key_id}</Text>
                      <Text style={styles.cacheItemMeta}>Controller: {key.controller}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {sdkSnapshot.contexts.length === 0 && sdkSnapshot.publicKeys.length === 0 &&
            sdkSnapshot.revokedVCs.length === 0 ? null : (
              <Pressable
                style={[styles.secondaryButton, { marginTop: 16 }]}
                onPress={() => refreshSdkSnapshot().catch(() => undefined)}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>Refresh Cache Details</Text>
              </Pressable>
            )}

            {(sdkSnapshot.contexts.length > MAX_SNAPSHOT_PREVIEW ||
              sdkSnapshot.publicKeys.length > MAX_SNAPSHOT_PREVIEW) ? (
              <Text style={styles.cacheItemMeta}>
                Showing first {MAX_SNAPSHOT_PREVIEW} of cached items. Use the refresh button after rescanning credentials to update this list.
              </Text>
            ) : null}

            <Pressable
              style={destructiveButtonStyle}
              onPress={handleClearAll}
              disabled={!canClearCache || isClearing}
              accessibilityRole="button"
            >
              {isClearing ? (
                <ActivityIndicator color="#dc2626" />
              ) : (
                <Text style={styles.destructiveButtonText}>Clear All Cached Data</Text>
              )}
              {!canClearCache ? (
                <Text style={styles.destructiveButtonHelper}>
                  Nothing cached yet. Add credentials or load SDK data to enable this action.
                </Text>
              ) : null}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    padding: 20,
    gap: 16,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    color: '#111827',
  },
  description: {
    fontSize: 16,
    color: '#4b5563',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  textInput: {
    minHeight: 160,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 12,
    fontSize: 14,
    backgroundColor: '#fff',
    textAlignVertical: 'top',
  },
  charCountWrapper: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  charCount: {
    fontSize: 12,
    color: '#6b7280',
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
  secondaryButton: {
    borderWidth: 2,
    borderColor: '#6366f1',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    color: '#4f46e5',
    fontWeight: '600',
    fontSize: 16,
  },
  destructiveButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 6,
  },
  destructiveButtonDisabled: {
    opacity: 0.5,
  },
  destructiveButtonText: {
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 16,
  },
  destructiveButtonHelper: {
    color: '#b91c1c',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  emptyState: {
    color: '#6b7280',
    fontSize: 14,
  },
  sdkSection: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    backgroundColor: '#fff',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#eef2ff',
    marginHorizontal: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#312e81',
  },
  metricLabel: {
    fontSize: 12,
    color: '#4338ca',
    marginTop: 4,
  },
  cacheList: {
    marginTop: 16,
    gap: 12,
  },
  cacheListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  cacheItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  cacheItemMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
});
