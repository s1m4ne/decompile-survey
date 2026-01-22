import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { screeningApi, LocalServerStatus } from '../lib/api';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Play, Loader2, CheckCircle, AlertCircle, Eye, X, Plus, FolderOpen, Wifi, WifiOff } from 'lucide-react';

export function ScreeningPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [inputFile, setInputFile] = useState('');
  const [rulesFile, setRulesFile] = useState('');
  const [provider, setProvider] = useState<'openai' | 'local'>('openai');
  const [model, setModel] = useState('gpt-5-nano-2025-08-07');
  const [concurrency, setConcurrency] = useState(10);
  const [showRulePreview, setShowRulePreview] = useState(false);
  const [showNewRuleForm, setShowNewRuleForm] = useState(false);
  const [newRuleFilename, setNewRuleFilename] = useState('');
  const [newRuleContent, setNewRuleContent] = useState('');

  // プロバイダー別のモデルオプション
  const modelOptions = {
    openai: [
      { value: 'gpt-5-nano-2025-08-07', label: 'gpt-5-nano' },
      { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { value: 'gpt-4o', label: 'gpt-4o' },
    ],
    local: [
      { value: 'openai/gpt-oss-120b', label: 'gpt-oss-120b (GPU0)' },
    ],
  };

  // プロバイダー変更時にモデルと並列数をリセット
  const handleProviderChange = (newProvider: 'openai' | 'local') => {
    setProvider(newProvider);
    setModel(modelOptions[newProvider][0].value);
    setConcurrency(newProvider === 'local' ? 500 : 10);
  };

  const { data: rules } = useQuery({
    queryKey: ['screening-rules'],
    queryFn: screeningApi.listRules,
  });

  const { data: inputs } = useQuery({
    queryKey: ['screening-inputs'],
    queryFn: screeningApi.listInputs,
  });

  const { data: ruleContent } = useQuery({
    queryKey: ['screening-rule', rulesFile],
    queryFn: () => screeningApi.getRule(rulesFile),
    enabled: !!rulesFile,
  });

  const runMutation = useMutation({
    mutationFn: screeningApi.run,
    onSuccess: (data) => {
      if (data.run_id) {
        navigate(`/reviews/${data.run_id}`);
      }
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: screeningApi.createRule,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['screening-rules'] });
      setRulesFile(data.filename);
      setShowNewRuleForm(false);
      setNewRuleFilename('');
      setNewRuleContent('');
    },
  });

  const pickFileMutation = useMutation({
    mutationFn: screeningApi.pickFile,
    onSuccess: (data) => {
      if (data.path && !data.cancelled) {
        setInputFile(data.path);
      }
    },
  });

  const [serverStatus, setServerStatus] = useState<LocalServerStatus | null>(null);
  const checkServerMutation = useMutation({
    mutationFn: screeningApi.checkLocalServer,
    onSuccess: (data) => {
      setServerStatus(data);
      // 接続成功時、サーバーから取得したモデルでmodelOptionsを更新
      if (data.connected && data.models.length > 0) {
        setModel(data.models[0].id);
      }
    },
  });

  // 次のバージョン番号を自動生成
  const getNextVersionFilename = () => {
    if (!rules || rules.length === 0) return 'decompile_v1';

    // バージョン番号を抽出（例: decompile_v3.md → 3）
    const versions: number[] = [];
    const prefixes: string[] = [];

    for (const rule of rules) {
      const match = rule.filename.match(/^(.+)_v(\d+)\.md$/);
      if (match) {
        prefixes.push(match[1]);
        versions.push(parseInt(match[2], 10));
      }
    }

    if (versions.length === 0) return 'decompile_v1';

    // 最も多いプレフィックスを使用
    const prefixCount: Record<string, number> = {};
    for (const p of prefixes) {
      prefixCount[p] = (prefixCount[p] || 0) + 1;
    }
    const mostCommonPrefix = Object.entries(prefixCount)
      .sort((a, b) => b[1] - a[1])[0][0];

    const maxVersion = Math.max(...versions);
    return `${mostCommonPrefix}_v${maxVersion + 1}`;
  };

  const handleOpenNewRuleForm = () => {
    setNewRuleFilename(getNextVersionFilename());
    setShowNewRuleForm(true);
  };

  const handleCreateRule = () => {
    if (!newRuleFilename || !newRuleContent) return;
    const filename = newRuleFilename.endsWith('.md') ? newRuleFilename : `${newRuleFilename}.md`;
    createRuleMutation.mutate({ filename, content: newRuleContent });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputFile || !rulesFile) return;

    runMutation.mutate({
      input_file: inputFile,
      rules_file: rulesFile,
      model,
      concurrency,
      provider,
    });
  };

  const isValid = inputFile && rulesFile;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Run Screening</h2>
        <p className="text-gray-500 mt-1">
          BibTeXファイルに対してAIスクリーニングを実行
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Input file */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                入力BibTeXファイル
              </label>
              <div className="flex items-center gap-2">
                <Select
                  value={inputFile}
                  onChange={(e) => setInputFile(e.target.value)}
                  className="flex-1"
                >
                  <option value="">ファイルを選択...</option>
                  {inputs?.map((input) => (
                    <option key={input.path} value={input.path}>
                      {input.database} / {input.filename}
                    </option>
                  ))}
                  {/* 選択したファイルがリストにない場合（Finderで選択した場合）も表示 */}
                  {inputFile && inputFile.startsWith('/') && (
                    <option value={inputFile}>
                      {inputFile.split('/').pop()}
                    </option>
                  )}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => pickFileMutation.mutate()}
                  disabled={pickFileMutation.isPending}
                  title="Finderでファイルを選択"
                >
                  {pickFileMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FolderOpen className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {inputFile && inputFile.startsWith('/') && (
                <p className="text-xs text-gray-500 mt-1 truncate" title={inputFile}>
                  {inputFile}
                </p>
              )}
            </div>

            {/* Rules file */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  スクリーニングルール
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => showNewRuleForm ? setShowNewRuleForm(false) : handleOpenNewRuleForm()}
                  className="text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  新規作成
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={rulesFile}
                  onChange={(e) => setRulesFile(e.target.value)}
                  className="flex-1"
                >
                  <option value="">ルールを選択...</option>
                  {rules?.map((rule) => (
                    <option key={rule.filename} value={rule.filename}>
                      {rule.filename}
                    </option>
                  ))}
                </Select>
                {rulesFile && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRulePreview(true)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* New rule form */}
              {showNewRuleForm && (
                <div className="mt-3 p-3 border border-gray-200 rounded-md bg-gray-50 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      ファイル名
                    </label>
                    <Input
                      value={newRuleFilename}
                      onChange={(e) => setNewRuleFilename(e.target.value)}
                      placeholder="例: decompile_v4"
                      className="text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-0.5">.mdは自動で追加されます</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      内容
                    </label>
                    <Textarea
                      value={newRuleContent}
                      onChange={(e) => setNewRuleContent(e.target.value)}
                      placeholder="# ルールタイトル&#10;&#10;## 採択条件&#10;- ..."
                      rows={8}
                      className="text-sm font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCreateRule}
                      disabled={!newRuleFilename || !newRuleContent || createRuleMutation.isPending}
                    >
                      {createRuleMutation.isPending ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : null}
                      作成
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowNewRuleForm(false);
                        setNewRuleFilename('');
                        setNewRuleContent('');
                      }}
                    >
                      キャンセル
                    </Button>
                    {createRuleMutation.isError && (
                      <span className="text-xs text-red-600">
                        {createRuleMutation.error?.message || '作成に失敗しました'}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Provider */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                プロバイダー
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="provider"
                    value="openai"
                    checked={provider === 'openai'}
                    onChange={() => handleProviderChange('openai')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm">OpenAI</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="provider"
                    value="local"
                    checked={provider === 'local'}
                    onChange={() => handleProviderChange('local')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm">ローカルサーバー</span>
                </label>
              </div>

              {/* ローカルサーバー接続確認 */}
              {provider === 'local' && (
                <div className="mt-2 p-3 bg-gray-50 rounded-md border border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">192.168.50.100:8000</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => checkServerMutation.mutate()}
                      disabled={checkServerMutation.isPending}
                      className="text-xs"
                    >
                      {checkServerMutation.isPending ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Wifi className="h-3 w-3 mr-1" />
                      )}
                      接続確認
                    </Button>
                  </div>

                  {serverStatus && (
                    <div className="mt-2">
                      {serverStatus.connected ? (
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          <span className="text-xs">接続OK</span>
                          {serverStatus.models.length > 0 && (
                            <span className="text-xs text-gray-500">
                              ({serverStatus.models.length}モデル利用可能)
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-red-600">
                          <WifiOff className="h-4 w-4" />
                          <span className="text-xs">{serverStatus.error}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                モデル
              </label>
              <Select value={model} onChange={(e) => setModel(e.target.value)}>
                {provider === 'openai' ? (
                  modelOptions.openai.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))
                ) : serverStatus?.connected && serverStatus.models.length > 0 ? (
                  serverStatus.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))
                ) : (
                  modelOptions.local.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))
                )}
              </Select>
              {provider === 'local' && !serverStatus?.connected && (
                <p className="text-xs text-gray-500 mt-1">
                  接続確認でモデル一覧を取得できます
                </p>
              )}
            </div>

            {/* Concurrency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                並列数
              </label>
              <Input
                type="number"
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value) || 1)}
                className="w-24"
              />
              <p className="text-xs text-gray-500 mt-1">
                {provider === 'local'
                  ? 'ローカルサーバーは高い並列数に対応（推奨: 50〜200）'
                  : 'OpenAI APIのrate limitに注意（推奨: 10〜50）'}
              </p>
            </div>

            {/* Submit */}
            <div className="pt-4 border-t border-gray-100">
              <Button
                type="submit"
                disabled={!isValid || runMutation.isPending}
                className="w-full"
              >
                {runMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    実行中...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Run Screening
                  </>
                )}
              </Button>
            </div>

            {/* Status */}
            {runMutation.isSuccess && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-md">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">
                  スクリーニング完了！レビュー画面に移動します...
                </span>
              </div>
            )}

            {runMutation.isError && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-md">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">
                  {runMutation.error?.message || 'スクリーニングに失敗しました'}
                </span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Rule Preview Modal */}
      {showRulePreview && ruleContent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="font-medium text-gray-900">{ruleContent.filename}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRulePreview(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                {ruleContent.content}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
