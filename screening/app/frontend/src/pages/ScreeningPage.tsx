import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { screeningApi } from '../lib/api';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Play, Loader2, CheckCircle, AlertCircle, Eye, X, Plus } from 'lucide-react';

export function ScreeningPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [inputFile, setInputFile] = useState('');
  const [rulesFile, setRulesFile] = useState('');
  const [model, setModel] = useState('gpt-5-nano-2025-08-07');
  const [concurrency, setConcurrency] = useState(10);
  const [showRulePreview, setShowRulePreview] = useState(false);
  const [showNewRuleForm, setShowNewRuleForm] = useState(false);
  const [newRuleFilename, setNewRuleFilename] = useState('');
  const [newRuleContent, setNewRuleContent] = useState('');

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
              <Select
                value={inputFile}
                onChange={(e) => setInputFile(e.target.value)}
              >
                <option value="">ファイルを選択...</option>
                {inputs?.map((input) => (
                  <option key={input.path} value={input.path}>
                    {input.database} / {input.filename}
                  </option>
                ))}
              </Select>
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

            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                モデル
              </label>
              <Select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="gpt-5-nano-2025-08-07">gpt-5-nano</option>
              </Select>
            </div>

            {/* Concurrency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                並列数
              </label>
              <Input
                type="number"
                min={1}
                max={50}
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value) || 10)}
                className="w-24"
              />
              <p className="text-xs text-gray-500 mt-1">
                同時に実行するAPI呼び出し数
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
