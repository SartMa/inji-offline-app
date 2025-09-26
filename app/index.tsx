import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useOfflineCache } from '@/context/OfflineCacheContext';
import { SAMPLE_VC_JSON } from '@/constants/sampleCredential';

const MAX_INPUT_LENGTH = 20000;

type ListItemProps = {
  id: string;
  summary?: string;
  issuer?: string;
  type?: string;
  createdAt: number;
  onRemove: (id: string) => void;
};

const CredentialListItem = ({ id, summary, issuer, type, createdAt, onRemove }: ListItemProps) => (
  <View style={styles.credentialCard}>
    <View style={{ flex: 1 }}>
      <Text style={styles.cardTitle}>{summary ?? type ?? 'Stored Credential'}</Text>
      {issuer ? <Text style={styles.cardSubtitle}>Issuer: {issuer}</Text> : null}
      {type ? <Text style={styles.cardSubtitle}>Type: {type}</Text> : null}
      <Text style={styles.cardTimestamp}>{new Date(createdAt).toLocaleString()}</Text>
    </View>
    <Pressable onPress={() => onRemove(id)} style={styles.removeButton} accessibilityRole="button">
      <Ionicons name="trash" size={20} color="#ef4444" />
    </Pressable>
  </View>
);

export default function AddCredentialScreen() {
  const router = useRouter();
  const { entries, addCredentialFromJson, removeCredential, loading } = useOfflineCache();
  const [jsonInput, setJsonInput] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);

  const handleAdd = async (payload?: string) => {
    try {
      const body = payload ?? jsonInput;
      if (!body.trim()) {
        Alert.alert('Nothing to add', 'Paste a credential JSON or import a file.');
        return;
      }
      setSubmitting(true);
      await addCredentialFromJson(body);
      if (!payload) {
        setJsonInput('');
      }
    } catch (error: any) {
      Alert.alert('Unable to cache credential', error?.message ?? 'Unknown error');
    } finally {
      setSubmitting(false);
    }
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
        Alert.alert('Import failed', 'Could not read the selected file.');
        return;
      }

      const content = await FileSystem.readAsStringAsync(asset.uri);
      await handleAdd(content);
    } catch (error: any) {
      Alert.alert('Import failed', error?.message ?? 'Unknown error');
    }
  };

  const renderFooter = () => (
    <View style={styles.footerActions}>
      <Pressable
        style={[styles.primaryButton, { marginBottom: 12 }]}
        onPress={() => router.push('/verify')}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>Go to Verification</Text>
      </Pressable>
      <Pressable
        style={styles.secondaryButton}
        onPress={() => setJsonInput(SAMPLE_VC_JSON.trim())}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryButtonText}>Load Sample Credential</Text>
      </Pressable>
    </View>
  );

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

        <Text style={[styles.heading, { marginTop: 32 }]}>Cached Credentials</Text>
        {loading ? (
          <ActivityIndicator />
        ) : entries.length === 0 ? (
          <Text style={styles.emptyState}>No credentials cached yet.</Text>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CredentialListItem
                {...item}
                onRemove={(id) => removeCredential(id).catch(() => Alert.alert('Failed to remove item'))}
              />
            )}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          />
        )}

        {renderFooter()}
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
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#4f46e5',
    fontWeight: '600',
    fontSize: 16,
  },
  credentialCard: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#4b5563',
  },
  cardTimestamp: {
    marginTop: 6,
    fontSize: 12,
    color: '#9ca3af',
  },
  removeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
    marginLeft: 12,
  },
  emptyState: {
    color: '#6b7280',
    fontSize: 14,
  },
  footerActions: {
    marginTop: 32,
  },
});
